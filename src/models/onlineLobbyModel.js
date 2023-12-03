const mongoose = require('mongoose')

var Schema = mongoose.Schema;

// create a schema
var OnlineLobbySchema = new Schema({
  state: String,
}, {
  collection: 'onlineLobbies',
  versionKey: false,
  timestamps: false,
});

module.exports = mongoose.model('OnlineLobby', OnlineLobbySchema);
