/*
 * --------------------------------------------------------------------------- *
 * File: index.js                                                              *
 * Project: lambda                                                             *
 * Created Date: 15 Oct 2022                                                   *
 * Author: Vikas K Solegaonkar (vikas@crystalcloudsolutions.com)               *
 * Copyright (c) 2022 Vikas K Solegaonkar                                      *
 * Crystal Cloud Solutions (https://crystalcloudsolutions.com)                 *
 *                                                                             *
 * Last Modified: Sun Oct 16 2022                                              *
 * Modified By: Vikas K Solegaonkar                                            *
 *                                                                             *
 * HISTORY:                                                                    *
 * --------------------------------------------------------------------------- *
 * Date         By     Comments                                                *
 * --------------------------------------------------------------------------- *
 */

const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = "EcommerceData";

/**
 * Create a signed JWT token for the user
 */
const createToken = (info) => {
  var token = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 86400,
      data: info,
    },
    process.env.SECRET || "SECRET"
  );
  return { token };
};

/**
 * Check if the token is good. If it is, return the user information.
 *
 * @param {*} token
 * @returns
 */
const checkToken = (token) => {
  try {
    var { data } = jwt.verify(token, process.env.SECRET);
    return data;
  } catch (e) {
    return {};
  }
};

/**
 * Extract the details out of the proxy input object.
 *
 * @param {*} event
 * @returns
 */
const extractEventDetails = (event) => ({
  body: event.body ? JSON.parse(event.body) : {},
  query: event.queryStringParameters ? event.queryStringParameters : {},
  path: event.path,
  method: event.httpMethod,
  source: event.requestContext?.identity?.sourceIp,
  user: checkToken(event.headers?.Authorization),
  apiKey: event.headers["x-api-key"],
  userAgent: event.headers["User-Agent"],
});

/**
 * Create the response object for the Lambda function
 *
 * @param {*} response
 * @returns
 */
const respond = async (response) => ({
  statusCode: 200,
  headers: {
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
  },
  body: JSON.stringify(await response),
});

/**
 * Process a Login attempt
 *
 * @param {*} data
 * @returns
 */
const login = async (data) => {
  var response = await ddb
    .get({
      TableName: TABLE_NAME,
      Key: {
        context: "user",
        id: data.userId,
      },
    })
    .promise();
  if (response.Item && response.Item.password === data.password) {
    return createToken(response.Item.info);
  }
};

/**
 * Create a new order in the application
 *
 * @param {*} data
 * @returns
 */
const createOrder = async (data) => {
  var order = { context: "order", id: nanoid(), ...data, orderStatus: "OPEN" };
  await ddb
    .put({
      TableName: TABLE_NAME,
      Item: order,
    })
    .promise();
  return { success: true };
};

/**
 * Mark an order as complete.
 *
 * @param {*} data
 * @returns
 */
const completeOrder = async (data) => {
  await ddb
    .update({
      TableName: TABLE_NAME,
      Key: {
        context: "order",
        id: data.id,
      },
      UpdateExpression: "set orderStatus = :c",
      ExpressionAttributeValues: {
        ":c": "CLOSED",
      },
    })
    .promise();
  return { success: true };
};

const reopenOrder = async (data) => {
  await ddb
    .update({
      TableName: TABLE_NAME,
      Key: {
        context: "order",
        id: data.id,
      },
      UpdateExpression: "set orderStatus = :c",
      ExpressionAttributeValues: {
        ":c": "OPEN",
      },
    })
    .promise();
  return { success: true };
};
/**
 * Get the list of items available for sale at the store.
 *
 * @param {*} data
 * @returns
 */
const getItemList = async (data) => {
  var response = await ddb
    .query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "context = :i",
      ExpressionAttributeValues: {
        ":i": "item",
      },
    })
    .promise();
  return response.Items;
};

/**
 * Get list of orders
 *
 * @returns
 */
const getOrderList = async () => {
  var response = await ddb
    .query({
      TableName: TABLE_NAME,
      KeyConditionExpression: "context = :i",
      ExpressionAttributeValues: {
        ":i": "order",
      },
    })
    .promise();
  return response.Items;
};

/**
 * Add a new item for sale.
 *
 * @param {*} data
 */
const addItem = async (data) => {
  var item = { context: "item", id: nanoid(), ...data };
  await ddb
    .put({
      TableName: TABLE_NAME,
      Item: item,
    })
    .promise();
};

/**
 * Remove an item from the database
 *
 * @param {*} data
 */
const removeItem = async (data) => {
  await ddb
    .delete({
      TableName: TABLE_NAME,
      context: "item",
      id: data.id,
    })
    .promise();
};

/**
 * The main input method for the Lambda function
 *
 * @param {*} event
 * @returns
 */
exports.handler = async (event) => {
  event = extractEventDetails(event);
  const { action, data } = event.body;

  switch (action) {
    case "INIT":
      return respond(init());
    case "LOGIN":
      return respond(login(data));
    case "ADD_ORDER":
      return respond(createOrder(data));
    case "ORDER_LIST":
      return respond(getOrderList(data));
    case "COMPLETE_ORDER":
      return respond(completeOrder(data));
    case "REOPEN_ORDER":
      return respond(reopenOrder(data));
    case "ITEM_LIST":
      return respond(getItemList(data));
    case "ADD_ITEM":
      return respond(addItem(data));
    case "REMOVE_ITEM":
      return respond(removeItem(data));
  }

  return respond({});
};

const init = async () => {
  var items = [
    { context: "item", id: "1", image: "images/product01.jpg", price: 10, title: "Tank Top", description: "" },
    { context: "item", id: "2", image: "images/product02.jpg", price: 10, title: "Polo-Shirt", description: "" },
    { context: "item", id: "3", image: "images/product03.jpg", price: 10, title: "T-Shirt", description: "" },
    { context: "user", id: "admin", password: "cac28395540089e505a68311833c2cb5a92f84f4" },
    {
      context: "order",
      id: "1",
      orderStatus: "OPEN",
      price: 10,
      title: "Tank Top",
      buyerName: "Mark Zucherberg",
      buyerAddress: "1 Hacker Way, Menlo Park, 94025 CA, United States of America.",
    },
    {
      context: "order",
      id: "2",
      orderStatus: "OPEN",
      price: 10,
      title: "Polo-Shirt",
      buyerName: "Sundar Pitchai",
      buyerAddress: "1600 Amphitheatre Parkway, Mountain View, CA 94043",
    },
    {
      context: "order",
      id: "3",
      orderStatus: "OPEN",
      price: 10,
      title: "T-Shirt",
      buyerName: "Andy Jassy",
      buyerAddress: "410 Terry Ave N, Seattle, Washington 98109, US",
    },
  ];
  var pList = items.map((i) => ddb.put({ TableName: "EcommerceData", Item: i }).promise());
  await Promise.all(pList).then((x) => console.log("Done"));
};
