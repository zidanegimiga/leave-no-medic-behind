const axios = require("axios");
const dotenv = require("dotenv");
const { getTimestamp } = require("../utils/timestamp");
const ngrok = require("ngrok");
const Mpesa = require("../models/Mpesa");

// loading the config files
dotenv.config({ path: "../../config/config.env" });

// @desc initiate stk push
// @method POST
// @route /stkPush
// @access

const initiateSTKPush = async (req, res) => {
  try {
    const { amount, phone, Order_ID } = req.body;
    const url =
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
    const auth = "Bearer " + req.safaricom_access_token;

    const timestamp = getTimestamp();
    //shortcode + passkey + timestamp
    const password = new Buffer.from(
      process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp
    ).toString("base64");
    // create callback url
    const callback_url = await ngrok.connect(process.env.PORT);
    const api = ngrok.getApi();
    await api.listTunnels();

    console.log("callback ", callback_url);
    axios({
      method: "post",
      url: url,
      headers: {
        Authorization: auth,
      },
      data: {
        BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: process.env.BUSINESS_SHORT_CODE,
        PhoneNumber: phone,
        CallBackURL: `${callback_url}/payment/stkPushCallback/${Order_ID}`,
        AccountReference: "Leave No Medic Behind",
        TransactionDesc: "Test",
      },
    })
      .then((response) => {
        res.status(200).json(response.data);
      })
      .catch((error) => {
        console.error(error);
        res.status(503).send({
          message: "Error with the stk push",
          error: error,
        });
      });
  } catch (e) {
    console.error("Error while trying to create LipaNaMpesa details", e);
    res.status(503).send({
      message:
        "Something went wrong while trying to create LipaNaMpesa details. Contact admin",
      error: e,
    });
  }
};

// @desc callback route Safaricom will post transaction status
// @method POST
// @route /stkPushCallback/:Order_ID
// @access public
const stkPushCallback = async (req, res) => {
  try {
    //    order id
    const { Order_ID } = req.params;

    console.log(`Order_ID: ${Order_ID}`);

    //callback details

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = req.body.Body.stkCallback;

    //     get the meta data from the meta
    const meta = Object.values(await CallbackMetadata.Item);
    const PhoneNumber = meta
      .find((o) => o.Name === "PhoneNumber")
      .Value.toString();
    const Amount = meta.find((o) => o.Name === "Amount").Value.toString();
    const MpesaReceiptNumber = meta
      .find((o) => o.Name === "MpesaReceiptNumber")
      .Value.toString();
    const TransactionDate = meta
      .find((o) => o.Name === "TransactionDate")
      .Value.toString();

    // do something with the data
    console.log("-".repeat(20), " OUTPUT IN THE CALLBACK ", "-".repeat(20));
    console.log(`
            Order_ID : ${Order_ID},
            MerchantRequestID : ${MerchantRequestID},
            CheckoutRequestID: ${CheckoutRequestID},
            ResultCode: ${ResultCode},
            ResultDesc: ${ResultDesc},
            PhoneNumber : ${PhoneNumber},
            Amount: ${Amount}, 
            MpesaReceiptNumber: ${MpesaReceiptNumber},
            TransactionDate : ${TransactionDate}
        `);
    // Create a new Mpesa object with the data received
    const mpesaData = new Mpesa({
      Order_ID,
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      PhoneNumber,
      Amount,
      MpesaReceiptNumber,
      TransactionDate,
    });

    // Save the data to the Mpesa collection in the MongoDB
    mpesaData.save((err, data) => {
      if (err) {
        console.error(err);
        res.status(503).send({
          message: "Error while trying to save Mpesa data",
          error: err,
        });
      } else {
        console.log("Mpesa data saved successfully!");
        res.status(200).json(data);
      }
    });

  } catch (e) {
    console.error(
      "Error while trying to update LipaNaMpesa details from the callback",
      e
    );
    res.status(503).send({
      message: "Something went wrong with the callback",
      error: e.message,
    });
  }
};

// @desc Check from safaricom servers the status of a transaction
// @method GET
// @route /confirmPayment/:CheckoutRequestID
// @access public
const confirmPayment = async (req, res) => {
  try {
    const url = "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";
    const auth = "Bearer " + req.safaricom_access_token;

    const timestamp = getTimestamp();
    //shortcode + passkey + timestamp
    const password = new Buffer.from(
      process.env.BUSINESS_SHORT_CODE + process.env.PASS_KEY + timestamp
    ).toString("base64");

    request(
      {
        url: url,
        method: "POST",
        headers: {
          Authorization: auth,
        },
        json: {
          BusinessShortCode: process.env.BUSINESS_SHORT_CODE,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: req.params.CheckoutRequestID,
        },
      },
      function (error, response, body) {
        if (error) {
          console.log(error);
          res.status(503).send({
            message:
              "Something went wrong while trying to create LipaNaMpesa details. Contact admin",
            error: error,
          });
        } else {
          res.status(200).json(body);
        }
      }
    );
  } catch (e) {
    console.error("Error while trying to create LipaNaMpesa details", e);
    res.status(503).send({
      message:
        "Something went wrong while trying to create LipaNaMpesa details. Contact admin",
      error: e,
    });
  }
};

module.exports = { initiateSTKPush, stkPushCallback, confirmPayment };
