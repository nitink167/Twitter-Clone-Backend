const { db, admin } = require('../utils/admin')

const config = require('../utils/config')

const firebase = require('firebase')
firebase.initializeApp(config)

const { validateSignUpData , validateLogInData, reduceUserDetails } = require('../utils/validators')

const noImg = 'no-img.png'


//SIGN UP USER
exports.signUpUser = (req, res) => {
    const newUser = {
        email : req.body.email,
        password : req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    }

    const { valid, errors } = validateSignUpData(newUser)

    if(!valid) return res.status(400).json(errors)

	let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
    .then(doc => {
        if(!doc.exists) {
            return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
        } else {
            return res.status(400).json({ handle: 'this handle already exists'})
        }
    })
    .then(data => {
        userId = data.user.uid;
        return data.user.getIdToken()
    })
    .then(idToken => {
        token = idToken;
        const userCredential = {
            handle: newUser.handle,
            email: newUser.email,
            createdAt: new Date().toISOString(),
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
            userId
        }
        db.doc(`/users/${newUser.handle}`).set(userCredential);
    })
    .then ( () => {
        return res.status(201).json({ token })
    })
    .catch(err => {
        if(err.code === 'auth/email-already-in-use') {
            return res.status(400).json({ email: 'Email is already in use'})
        } else {
            return res.status(500).json( { general: 'Something went wrong, please try again'});
			}
        }
    )
}
// END OF SIGN UP USER


// LOGIN USER
exports.logInUser = (req,res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLogInData(user)
    if(!valid) return res.status(400).json(errors)

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
        return data.user.getIdToken();
    })
    .then(token => {
        return res.json( { token } )
    })
    .catch(err => {
        console.log(err);
        if(err.code === 'auth/wrong-password') {
            return res.status(403).json({ general : 'Wrong credentials, try again'})
        } else {
            return res.status(500).json({error: err.code})
        }
    })
}
// END OF LOGIN USER


//GET USER DETAILS
exports.getAuthenticatedUser = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.user.handle}`).get()
        .then(doc => {
            if(doc.exists) {
                userData.credentials = doc.data();
                return db.collection('likes').where('userHandle', '==', req.user.handle).get()
            }
        })
        .then(data => {
            userData.likes = []
            data.forEach(doc => {
                userData.likes.push(doc.data());
            })
            return db.collection('notifications').where('recipient', '==', req.user.handle)
            .orderBy('createdAt', 'desc').get()
        })
        .then((data => {
            userData.notifications = [];
             
            data.forEach(doc => {
                userData.notifications.push({
                    recipient: doc.data().recipient,
                    sender: doc.data().sender,
                    createdAt: doc.data().createdAt,
                    screamId: doc.data().screamId,
                    type: doc.data().type,
                    read: doc.data().read,
                    notificationId: doc.id
                });
            })
            return res.status(200).json(userData);
        }))
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code })
        })
}
// END OF GET USER DETAILS


//GET ANY USER DETAILS
exports.getUserDetails = (req, res) => {
    let userData = {};

    db.doc(`/users/${req.params.handle}`).get()
    .then( doc => {
        if(doc.exists) {
            userData.user = doc.data()
            return db.collection('screams').where('userHandle', '==', req.params.handle)
            .orderBy('createdAt', 'desc').get()
        } else {
            return res.status(404).json({error: 'User not found'})
        }
    })
    .then(data => {
        userData.screams = [],
        data.forEach( doc => {
            userData.screams.push({
                body: doc.data().body,
                createdAt: doc.data().createdAt,
                userHandle: doc.data().userHandle,
                userImage: doc.data().userImage,
                likeCount: doc.data().likeCount,
                commentCount: doc.data().commentCount,
                screamId: doc.id
            })
        })
        return res.json(userData)
    })
    .catch( err => {
        console.error(err);
        return res.status(500).json({error: err.code})
    })
}
//END OF GET ANY USER DETAILS


// ADD USER DETAILS
exports.addUserDetails = (req, res) => {
    let userDetails = reduceUserDetails(req.body);

    db.doc(`users/${req.user.handle}`).update(userDetails)
        .then(() => {
            return res.status(200).json({ message: 'Details added successfuly'})
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: err.code})
        })
}
// END OF ADD USER DETAILS


// UPLOAD USER IMAGE
exports.uploadUserImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os =  require('os');
    const fs = require('fs')
    const busboy = new BusBoy( { headers: req.headers });
    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        if(mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
            return res.status(400).json({ error : 'Wrong file type submitted'})
        }
        // my.image.png = ['my', 'image', 'png']
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        // 65298753614.jpg
        imageFileName = `${Math.round(Math.random()*100000000000)}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filepath, mimetype};
        file.pipe(fs.createWriteStream(filepath));
    })

    busboy.on('finish', () => {
        admin.storage().bucket(`${config.storageBucket}`).upload(imageToBeUploaded.filepath, {
            resumable: false,
            metadata: {
                metadata: {
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(() => {
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            return db.doc(`users/${ req.user.handle }`).update({ imageUrl });

        })
        .then(() => {
            return res.status(200).json({ message: 'Image Uploaded Successfully' })
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json( {err: err.code} )
        })
    })
    busboy.end(req.rawBody);
}


//MARKING NOTIFICATION AS READ
exports.markNotificationsRead = (req, res) => {
    let batch = db.batch();

    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`)
        batch.update(notification, { read: true });
    })
    batch.commit()
    .then(() => {
        return res.json({ message: "Notifications mark read"})
    })
    .catch( err => {
        console.error(err);
        return resstatus(500).json({ error: err.code})
    })
}