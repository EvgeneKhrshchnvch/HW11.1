import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const { writeFile, readFile, unlink } = require("fs").promises

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

let connections = []

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', 'eb7c973a-dc3a-4105-b3df-6b4e4721f973')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

const port = process.env.PORT || 8090
const server = express()

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  setHeaders,
  cookieParser()
]

const readWrite = () => {
  return readFile(`${__dirname}/test.json`, { encoding: "utf8" })
    .then(it => JSON.parse(it))
    .catch(async () => {
      const users = await axios('https://jsonplaceholder.typicode.com/users').then(link => link.data)
      writeFile(`${__dirname}/test.json`, JSON.stringify(users), { encoding: "utf8" })
      return users
    })
}

const writeFileForUsers = (user) => {
  return writeFile(`${__dirname}/test.json`, JSON.stringify(user), { encoding: "utf8" })
}

middleware.forEach((it) => server.use(it))

server.get('/api/v1/users', async (req, res) => {
  const text = await readWrite()
  res.json( text )
})

server.post('/api/v1/users', async (req, res) => {
  const newUser = req.body
  const users = await readWrite()
  // const lastUserId = users[users.length - 1].id + 1
  const sortUsers = users.sort(users.id)
  const lastUserId = sortUsers[sortUsers.length - 1].id + 1
  const newUsers = [...users, {...newUser, id: lastUserId}]

  writeFileForUsers(newUsers)

  res.json({status: 'success', id: lastUserId})
})


server.patch('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  const users = await readWrite()
  const newUser = users.find(item => item.id === +userId)
  const newFields = {...newUser, ...req.body}
  const list = users.reduce((acc, rec) => {
    return rec.id === +userId ? [...acc, newFields] : [...acc, rec]
  }, [])
  writeFileForUsers(list)
  res.json({ status: 'success', id: userId })
})



server.delete('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  const usersArray = await readWrite()
  const filterUsers = usersArray.filter(it => it.id !== +userId)
  writeFileForUsers(filterUsers)
  res.json({ status: 'success', id: userId })
})

server.delete('/api/v1/users/', async (req, res) => {
  unlink(`${__dirname}/test.json`)
  res.json()
})



server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)