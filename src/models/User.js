const mongoose = require('mongoose')

var Schema = mongoose.Schema;

// create a schema
var UserSchema = new Schema({
  email: String,
}, {
  collection: 'users',
  versionKey: false,
  timestamps: false,
});

module.exports = mongoose.model('User', UserSchema);
