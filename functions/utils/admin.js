const admin = require('firebase-admin');
// var serviceAccount = require("../../socialape-3eeba-firebase-adminsdk-qh93c-ef3771cabc.json");
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "https://socialape-3eeba.firebaseio.com"
// });
admin.initializeApp()

const db = admin.firestore();

module.exports = { admin, db };