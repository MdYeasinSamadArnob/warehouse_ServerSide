const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    console.log("The Authheader is :",authHeader);
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        console.log('decoded', decoded);
        req.decoded = decoded;
        next();
    })
}





// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b8rim.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b8rim.mongodb.net/test`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        
                await client.connect();
                const inventoriesCollection = client.db('arnobwarehouse').collection('inventories');
                const orderCollection = client.db('arnobwarehouse').collection('orders');
                const userCollection = client.db('arnobwarehouse').collection('users');
                const reviewCollection = client.db('arnobwarehouse').collection('reviews')
                const paymentCollection = client.db('arnobwarehouse').collection('payments');

                
                const verifyAdmin = async (req, res, next) => {
                    const requester = req.decoded.email;
                    const requesterAccount = await userCollection.findOne({ email: requester });
                    if (requesterAccount.role === 'admin') {
                      next();
                    }
                    else {
                      res.status(403).send({ message: 'forbidden' });
                    }
                  }
               

                // POST
                app.post('/addinventory', async (req, res) => {
                const newService = req.body;
                const result = await inventoriesCollection.insertOne(newService);
                res.send(result);
                
        });

        // Get All reviews
        app.get('/reviews', async (req, res) => {
            const reviews = await reviewCollection.find({}).toArray();
            console.log(reviews);
            res.send(reviews);
        });


        // AUTH
        app.post('/login', async (req, res) => {
            const user = req.body;
            const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1d'
            });
            res.send({ accessToken });
        })

        // SERVICES API
        app.get('/inventoryitems', async (req, res) => {
            const query = {};
            const cursor = inventoriesCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        // Update user in mongodb
        app.post('/updateuser', async (req, res) => {
            // const id = req.params.id;
            const update = req.body;
            console.log(update);
            // find one
            const result = await userCollection.findOne({ email: update.email });
            if(!result){
            const result2 = await userCollection.insertOne({ ...update }, { $set: update });
            res.send(result2);
            }
            else{
                // update
                const result2 = await userCollection.updateOne({ email: update.email }, { $set: update });
            res.send(result2);
            }
        });

        // Store reviews in mongodb
        app.post('/reviews', async (req, res) => {
            const newReview = req.body;
            const result = await reviewCollection.insertOne(newReview);
            res.send(result);
        });

        app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
            const service = req.body;
            const price = service.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
              amount : amount,
              currency: 'usd',
              payment_method_types:['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
          });

        app.patch('/booking/:id', verifyJWT, async(req, res) =>{
            const id  = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc = {
              $set: {
                paid: true,
                transactionId: payment.transactionId
              }
            }

            
      
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
          })

          app.get('/booking/:id', verifyJWT, async(req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await orderCollection.findOne(query);
            res.send(booking);
          })

        // Booking
        app.post('/order', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            // const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            // const exists = await orderCollection.findOne(query);
            // if (exists) {
            //   return res.send({ success: false, booking: exists })
            // }
            const result = await orderCollection.insertOne(booking);
            console.log('sending email');
            // sendAppointmentEmail(booking);
            return res.send({ success: true, result });
          });

        app.get('/inventory/:id', async (req, res) => {
            const id = req.params.id;
            // const body=req.body;
            console.log(id);
            const query = { _id: ObjectId(id) };
            const result = await inventoriesCollection.findOne(query);
            res.send(result);
        });

        app.post('/inventoryupdate/:id', async (req, res) => {
            const id = req.params.id;
            // const body=req.body;
            console.log(id);
            // const query = { _id: ObjectId(id) };
            const result = await inventoriesCollection.updateOne({_id: ObjectId(id)}, {$set: {
                quantity: req.body.quantity,
                price: req.body.price,
                description: req.body.description,
                itemName: req.body.itemName,
                supplierName: req.body.supplierName,
                image: req.body.image,
                minimumquantity: req.body.minimumquantity,


            
            }});
            res.send(result);
        });

        app.post("/inventory/:id",async (req,res)=>{
            const id = req.params.id;
            console.log(id);
            const query = { _id: ObjectId(id) };
            const result = await inventoriesCollection.findOne(query);
            res.send(result);
        })

        // DELETE
        app.delete('/inventory/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const query = { _id: ObjectId(id) };
            const result = await inventoriesCollection.deleteOne(query);
            res.send(result);
        });

        // Get User
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
          });

        app.get('/user/:email', async (req, res) => {
            const id = req.params.email;
            const query = { email: id};
            const result = await userCollection.findOne(query);
            res.send(result);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            console.log(user);
            if(user){
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
            }
            else{
                res.send({ admin: false })
            }
          })
      
          app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
              $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
          })

          app.put('/userchange/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
              $set: { role: 'none' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
          })

        // DELETE
        app.delete('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            
            const booking = await orderCollection.findOne(query);
            console.log(booking);
            const updatedDoc = {
                $inc: {
                 quantity: parseInt(booking.minimumquantity),
                }
              }
              console.log(updatedDoc);
              const query2={itemName: booking.itemName}
              const updatedBooking = await inventoriesCollection.updateOne(query2, updatedDoc);
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        });

        // MyItems Collection API

        app.get('/orders', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.query.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = orderCollection.find(query);
                const results = await cursor.toArray();
                res.send(results);
            }
            else{
                res.status(403).send({message: 'forbidden access'})
            }
        })

            }
            finally {
        
            }
        }


        run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Running Manufacture Server');
});



app.listen(port, () => {
    console.log('Listening to port', port);
})



