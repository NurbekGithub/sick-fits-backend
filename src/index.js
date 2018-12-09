require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');

const server = createServer();

// TODO Use express middlware to handle cokkeies (JWT)
// TODO Use express middlware to populate current user

server.start({
    cors: {
        credentials: true,
        origin: process.env.FRONTEND_URL,
    }
}, deets => {
    console.log(`Server is now running on port ${deets.port}`)
})