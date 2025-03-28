require("dotenv").config();
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")("sk_test_51OmCLvSBps3k53HfHNmwD4IxCyagsqte5KJP9iWZHFjKi7PEBadERfSwClp3GMeiij1Nvf5cfHoVWrM6m7wJEKB900QwjGA1Si");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/create-checkout-session" , async(req ,res)=>{
   const {products} = req.body;

   const lineItems = products.map((product)=>({
    price_data:{
      currency: "usd" , 
      product_data:{
        name: product.name
      },
      unit_amount: product.price*100,

    },
    quantity: product.quantity
   }));

   const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems , 
    mode:"payment" , 
    success_url:"http://localhost:3000/"
   })


    res.json({
       id: session.id
    })

})


// this is for subscrition checkout 

app.post("/create-subscription-session" , async(req ,res)=>{
   const {priceId} = req.body;

   const session =  await stripe.checkout.sessions.create({
      mode:"subscription" , 
      payment_method_types: ['card'] , 
      line_items:[
        {
          price: "price_1R4iGcSBps3k53HfEfy6tprs" , 
          quantity:1 , 
        }
      ],
      success_url: "http://localhost:3000/success" , 
      cancel_url:"http://localhost:3000/cancel"
    })

    res.json({
      url: session.url
    })
})

app.listen(5000, () => console.log("Server running on port 5000"));
