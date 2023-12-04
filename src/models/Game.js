const mongoose = require('mongoose')

var Schema = mongoose.Schema;

var GameSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  onlineLobbyId: {
    type: Schema.Types.ObjectId,
    ref: 'OnlineLobby',
  },
}, {
  collection: 'games',
  versionKey: false,
  timestamps: false,
});

module.exports = mongoose.model('Game', GameSchema);
