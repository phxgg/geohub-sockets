require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const http = require('http');
const socketServer = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();

// const userModel = require('./models/userModel');
const onlineLobbyModel = require('./models/OnlineLobbyModel');

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

var server = http.createServer(app);
var io = socketServer(server);

server.listen(process.env.PORT || 3001, () => {
  console.log('Running websocket server');
});

/* TODO: Flow
 * 1. Generate jwt token in GeoHub when user logs in
 * 2. Send jwt token via socket.io connection
 * 3. Use middleware to valiate jwt token
 * 4. If valid, set a property on the socket object (e.g. socket.decoded or socket.user)
 */

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

    // emit to all sockets in the room
    io.in(lobbyId).emit('update:lobby', { ...onlineLobby.toJSON(), playersInLobby });
  } catch (err) {
    console.log(err);
  }
}

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
  connections.push(socket);
  socket.on('disconnect', function () {
    console.log(`Disconnected - ${socket.id}`);
    connections.splice(connections.indexOf(socket), 1);
  });

  socket.on('join:lobby', async function (data) {
    console.log(`[${socket.id}] Joining lobby ${data.lobbyId}`);
    // Join a room
    socket.join(data.lobbyId);
    // Update the lobby
    await updateLobby(data.lobbyId);
    // Update lobby every time leaves the room
    socket.on('disconnect', async function () {
      console.log(`[${socket.id}] Leaving lobby ${data.lobbyId}`);
      await updateLobby(data.lobbyId);
    });
  });
});