const WebSocket = require('ws')
const axios = require('axios')

const Sockets = {}
Sockets.ws = {}
Sockets.heartbeat = {}

getPublicWsToken = async function(baseURL) {
  let endpoint = '/api/v1/bullet-public'
  let url = baseURL + endpoint
  let result = await axios.post(url, {})
  return result.data
}

getPrivateWsToken = async function(baseURL, sign) {
  let endpoint = '/api/v1/bullet-private'
  let url = baseURL + endpoint
  let result = await axios.post(url, {}, sign)
  return result.data
}

getSocketEndpoint = async function(type, baseURL, environment, sign) {
  let r
  if (type == 'private') {
    r = await getPrivateWsToken(baseURL, sign)
  } else { 
    r = await getPublicWsToken(baseURL)
  }
  let token = r.data.token
  if (environment === 'sandbox') {
    return `wss://push1-sandbox.kucoin.com/endpoint?token=${token}&[connectId=${Date.now()}]`
  } else if (environment === 'live') {
    return `wss://push1-v2.kucoin.com/endpoint?token=${token}&[connectId=${Date.now()}]`
  }
}

/*  
  Initiate a websocket
  params = {
    topic: enum 
    symbols: array [optional depending on topic]
  }
  eventHanlder = function
*/
Sockets.initSocket = async function(params, eventHandler) {
  try {
    let [topic, endpoint, type] = Sockets.topics(params.topic, params.symbols);
    let sign = this.sign('/api/v1/bullet-private', {}, 'POST')
    let websocket = await getSocketEndpoint(type, this.baseURL, this.environment, sign)
    let ws = Sockets.ws[topic]
    if (ws) {
      Sockets.subscribe(topic, endpoint, type, eventHandler)
      return
    }
    ws = new WebSocket(websocket)
    Sockets.ws[topic] = ws
    ws.on('open', () => {
      this.l.info(topic + ' opening websocket connection... ')
      Sockets.subscribe(topic, endpoint, type, eventHandler)
    })
    ws.on('error', (error) => {
      Sockets.handleSocketError(error)
      this.l.debug(error)
    })
    ws.on('ping', () => {
      return
    })
    ws.on('close', () => {
      clearInterval(Sockets.ws[topic].heartbeat)
      this.l.warn(topic + ' websocket closed...')
    })
  } catch (err) {
    this.l.error(err)
  }
}

Sockets.handleSocketError = function(error) {
  this.l.error('WebSocket error: ' + (error.code ? ' (' + error.code + ')' : '') +
  (error.message ? ' ' + error.message : ''))
}

Sockets.socketHeartBeat = function(topic) {
  let ws = Sockets.ws[topic]
  ws.ping()
}

Sockets.subscribe = async function(topic, endpoint, type, eventHandler) {
  if (!Sockets.ws[topic].heartbeat) {
    Sockets.ws[topic].heartbeat = setInterval(Sockets.socketHeartBeat, 20000, topic)
  }
  let ws = Sockets.ws[topic]
  if (type === 'private') {
    ws.send(JSON.stringify({
      id: Date.now(),
      type: 'subscribe',
      topic: endpoint,
      privateChannel: true,
      response: true
    }))
  } else {
    ws.send(JSON.stringify({
      id: Date.now(),
      type: 'subscribe',
      topic: endpoint,
      response: true
    }))
  }
  ws.on('message', eventHandler)
}

Sockets.unsubcsribe = async function(topic, endpoint, type, eventHandler) {
  let ws = Sockets.ws[topic]
  ws.send(JSON.stringify({
    id: Date.now(),
    type: 'unsubscribe',
    topic: endpoint,
    response: true
  }))
  ws.on('message', eventHandler)
}

Sockets.topics = function(topic, symbols = []) {
  if (topic === 'ticker') {
    return [topic, "/market/ticker:" + symbols.join(','), 'public']
  } else if (topic === 'allTicker') {
    return [topic, "/market/ticker:all", 'public']
  } else if (topic === 'symbolSnapshot') {
    return [topic, "/market/snapshot:" + symbols[0], 'public']
  } else if (topic === 'marketSnapshot') {
    return [topic, "/market/snapshot:" + symbols[0], 'public']
  } else if (topic === 'orderbook') {
    return [topic, "/market/level2:" + symbols.join(','), 'public']
  } else if (topic === 'match') {
    return [topic, "/market/match:" + symbols.join(','), 'public']
  } else if (topic === 'fullMatch') {
    return [topic, "/market/level3:" + symbols.join(','), 'public']
  } else if (topic === 'orders') {
    return [topic, "/market/level3:" + symbols.join('-'), 'private']
  } else if (topic === 'balances') {
    return [topic, "/account/balance", 'private']
  }
}

module.exports = Sockets
