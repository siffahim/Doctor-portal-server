const { MongoClient, Admin } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 5000;
require('dotenv').config();
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')('sk_test_51JwnGrLiLwVG3jO0cewKLOH7opNVle1UFZap9o05XufrjqX5BkOgl5kZrl8YEepiB5IbPF0JSObI8gPt7FCwKRf200aJzI14tq')
const fileUpload = require('express-fileupload')

//middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload())

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

//mongoDB connect 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lyhqa.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1]

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }
    }
    next()
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctor_portal');
        const appointmentCollection = database.collection('appointments');
        const usersCollection = database.collection('users');
        const doctorCollection = database.collection('doctors');



        //doctor information save to mongodb
        app.get('/doctors', async (req, res) => {
            const cursor = doctorCollection.find({})
            const result = await cursor.toArray()
            res.json(result)
        })


        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const picData = pic.data;
            const encodedPic = picData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorCollection.insertOne(doctor)
            res.json(result)
        })


        //get
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            // const date = new Date(req.query.date).toLocaleDateString();
            // let query = { email: email, date: date };
            // console.log(query)
            const query = { email: email, date: date };
            console.log(query)
            const cursor = appointmentCollection.find(query)
            const result = await cursor.toArray();
            console.log(result)
            res.json(result)
        })

        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentCollection.findOne(query);
            res.json(result)
        })

        //post 
        app.post('/appointments', async (req, res) => {
            const appoinment = req.body;
            console.log(appoinment)
            const result = await appointmentCollection.insertOne(appoinment);
            res.json(result)
        })


        //payment update
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    payment: payment
                }
            }
            const result = await appointmentCollection.updateOne(filter, updateDoc);
            res.json(result)
        })

        //user data

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const user = await usersCollection.findOne(filter);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true
            }
            res.json({ admin: isAdmin })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        })

        app.put('/users', async (req, res) => {
            const user = req.body;
            //console.log(user)
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const resutl = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(resutl)
        })

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester })
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } }
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result)
                }
            }
            else {
                req.status(403).json({ message: 'you do not access to make admin anyone' })
            }

        })

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: [
                    'card'
                ]
            })
            res.json({ clientSecret: paymentIntent.client_secret })
        })
    }
    finally {
        // await client.close();
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('I M Doctor Portal Server')
})

app.listen(port, () => {
    console.log('Running doctor server ', port)
})