const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const bodyParser = require("body-parser");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qxayaa3.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    const classCollection = client.db("summercamp").collection("classes");
    const instructorCollection = client
      .db("summercamp")
      .collection("instructor");
    const studentSelecetedClassCollection = client
      .db("summercamp")
      .collection("selectedclass");
    const paymentCollection = client.db("summercamp").collection("payments");
    const usersCollection = client.db("summercamp").collection("users");

    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    app.post("/users", async (req, res) => {
      
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();

      res.send(result);
    });
    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email != email) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await usersCollection.find(query).toArray();
      if (user?.length > 0) {
        const result = await { role: user[0]?.role };
        res.send(result);
      }
    });

    app.patch("/users/role/:id", verifyJWT,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.get("/classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection
        .find(query)
        .sort({ enrolled: -1 })
        .toArray();

      res.send(result);
    });
    app.get("/manageclass", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.patch("/feedback", verifyJWT,verifyAdmin, async (req, res) => {
      const feedback = req.body.feedback;
      const id = req.body.id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch('/statupdate',verifyJWT,verifyAdmin,async(req,res)=>{
        const status=req.body.status
        const id=req.body.id

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };
        const result = await classCollection.updateOne(filter, updateDoc);
        res.send(result);

    })

    app.get("/instructorclasses", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (req.decoded.email != email) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { instructorEmail: email };

      const user = await classCollection.find(query).toArray();

      res.send(user);
    });
    app.get("/instructorclass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id.trim();
      // console.log(id)
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.find(query).toArray();

      res.send(result);
    });

    app.patch("/instructorupdateclasses/:id", verifyJWT, async (req, res) => {
      const id = req.params.id.trim();
      const course = req.body;
      console.log("update");
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: course.name,
          image: course.image,
          instructor: course.instructor,
          instructorEmail: course.instructorEmail,
          availableSeats: course.availableSeats,
          price: course.price,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/classes", verifyJWT, async (req, res) => {
      const newClass = req.body;

      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.get("/instructor", async (req, res) => {
      const query={role:'instructor'}
      const result = await usersCollection.find(query).toArray();

      res.send(result);
    });

    app.post("/selectedclasses", verifyJWT, async (req, res) => {
      const data = req.body;
      const query = { courseId: data.courseId, email: data.email };
      const getid = await studentSelecetedClassCollection.findOne(query);

      if (getid) {
        res.send("already exists");
      } else {
        const result = await studentSelecetedClassCollection.insertOne(data);
        res.send(result);
      }
    });

    app.get("/selectedclasses", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (req.decoded.email != email) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await studentSelecetedClassCollection.find(query).toArray();

      res.send(user);
    });

    app.delete("/selectedclasses/:id", verifyJWT, async (req, res) => {
      const email = req.decoded.email;

      const id = req.params.id;

      const query = { courseId: id, email: email };
      const result = await studentSelecetedClassCollection.deleteOne(query);

      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const InsertResult = await paymentCollection.insertOne(payment);

      const query = { courseId: { $in: payment.coursesId } };
      const deleteResult = await studentSelecetedClassCollection.deleteMany(
        query
      );

      const updateResult = await classCollection.updateMany(
        {
          _id: { $in: payment.coursesId.map((id) => new ObjectId(id)) },
          availableSeats: { $exists: true, $gt: 0 },
        },
        { $inc: { availableSeats: -1 } }
      );

      res.send({ InsertResult, deleteResult, updateResult });
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (req.decoded.email !== email) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }

      const query = { email: email };
      const sortOptions = { _id: -1 };

      const user = await paymentCollection
        .find(query)
        .sort(sortOptions)
        .toArray();

      res.send(user);
    });

    app.get("/existsenroll/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { coursesId: { $in: [id] }, email: req.decoded.email };

      const result = await paymentCollection.find(query).toArray();
      if (result.length > 0) {
        res.send({ exists: true });
      } else {
        res.send({ exists: false });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});
