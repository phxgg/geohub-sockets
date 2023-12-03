require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const http = require('http');
const socketServer = require('socket.io');

const app = express();

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

const connections = [];
io.on('connection', async function (socket) {
  console.log('Connected to Socket ' + socket.id)
  connections.push(socket);
  socket.on('disconnect', function () {
    console.log('Disconnected - ' + socket.id);
  });

  try {
    const onlineLobbies = await onlineLobbyModel.find({}).exec();
    if (!onlineLobbies) {
      console.log('No online lobbies found');
      return;
    }
    console.log(onlineLobbies);
    socket.emit('onlineLobbies', onlineLobbies);
  } catch (err) {
    console.log(err);
  }
});