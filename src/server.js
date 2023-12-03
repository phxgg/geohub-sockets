require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const http = require('http');
const socketServer = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();

// load db models
// const userModel = require('./models/userModel');
const onlineLobbyModel = require('./models/OnlineLobbyModel');

// express middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// connect to db
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
var db = mongoose.connection;
db.on('error', () => {
  console.log('FAILED to connect to mongoose');
});
db.once('open', () => {
  console.log('Connected to mongoose')
});
var gracefulExit = function () {
  db.close().then(() => {
    console.log('Mongoose db connection closed');
    process.exit(0);
  });
}
process.on('SIGINT', gracefulExit).on('SIGTERM', gracefulExit);

// initialize express app & io server
var server = http.createServer(app);
var io = socketServer(server);
server.listen(process.env.PORT || 3001, () => {
  console.log('Running websocket server');
});

/* TODO: 
  - handle state of the lobby (waiting, playing, finished)
    - waiting: players can join the lobby and click 'ready' button. When all players are ready, the game starts
    - playing: players cannot join the lobby. When all players are finished, the game ends
    - finished: players cannot join the lobby. Players can see the results of the game
 */

const connections = [];
io.use(function (socket, next) {
  if (socket.handshake.query && socket.handshake.query.accessToken) {
    jwt.verify(socket.handshake.query.accessToken, process.env.JWT_SECRET, function (err, decoded) {
      if (err) return next(new Error('Authentication error'));
      socket.decoded = decoded;
      next();
    });
  } else {
    next(new Error('Authentication error'));
  }
})

io.on('connection', async function (socket) {
  console.log(`Socket ${socket.id} connected`)
  // set ready to false
  socket.ready = false;
  connections.push(socket);
  socket.on('disconnect', function () {
    console.log(`Disconnected - ${socket.id}`);
    connections.splice(connections.indexOf(socket), 1);
  });

  socket.on('join:lobby', async function (data) {
    console.log(`[${socket.id}] Joining lobby ${data.lobbyId}`);
    // FIXME: This will not allow players to rejoin the game after disconnecting
    // Check if game in lobby has already started
    const onlineLobby = await onlineLobbyModel.findOne({ _id: data.lobbyId, state: 'waiting' }).exec();
    if (!onlineLobby) {
      console.log('Game is not in waiting state');
      return;
    }

    // Join a room
    socket.join(data.lobbyId);
    // Update the lobby
    await updateLobby(data.lobbyId);
    // Update lobby every time leaves the room
    socket.on('disconnect', async function () {
      console.log(`[${socket.id}] Leaving lobby ${data.lobbyId}`);
      await updateLobby(data.lobbyId);
    });

    socket.on('player:ready', async function (data) {
      // set ready to true
      socket.ready = data.ready;
      // Update the lobby
      await updateLobby(data.lobbyId);
    });

    socket.on('start:game', async function (data) {
      // check if all players are ready
      const playersInLobby = await getPlayersInLobby(data.lobbyId);
      const allPlayersReady = playersInLobby.every(p => p.ready);
      if (!allPlayersReady) {
        console.log('Not all players are ready');
        return;
      }
      // Update the lobby state to 'playing'
      const onlineLobby = await onlineLobbyModel.findOne({ _id: data.lobbyId, state: 'waiting' }).exec();
      if (onlineLobby) {
        onlineLobby.state = 'playing';
        await onlineLobby.save();
      }
      console.log(`[${socket.id}] Starting game in lobby ${data.lobbyId}`);
      // Update the lobby
      await updateLobby(data.lobbyId);
    });
  });
});

// functions
async function getPlayersInLobby(lobbyId) {
  // get unique players in the room data.lobbyId
  const rooms = io.sockets.adapter.rooms; // this is a Map
  const room = rooms.get(lobbyId); // this is a Set
  // if room does not exist, return empty array
  if (!room) return [];
  // get only unique players
  const playersInLobby = [...room].reduce((acc, socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    const player = {
      id: socket.decoded.id,
      name: socket.decoded.name,
      avatar: socket.decoded.avatar,
      ready: socket.ready,
    };
    if (!acc.some(p => p.id === player.id)) {
      acc.push(player);
    }
    return acc;
  }, []);
  return playersInLobby;
}

async function updateLobby(lobbyId) {
  try {
    // Get the lobby from the database
    const onlineLobby = await onlineLobbyModel.findOne({ _id: lobbyId }).exec();
    if (!onlineLobby) {
      console.log('No online lobby found');
      return;
    }

    // Get unique players in the room
    const playersInLobby = await getPlayersInLobby(lobbyId);
    // check if all players are ready
    const allPlayersReady = playersInLobby.every(p => p.ready);
    // check if game has started
    const gameStarted = onlineLobby.state === 'playing';
    // emit to all sockets in the room
    io.in(lobbyId).emit('update:lobby', {
      ...onlineLobby.toJSON(),
      gameStarted,
      playersInLobby,
      allPlayersReady
    });
  } catch (err) {
    console.log(err);
  }
}
