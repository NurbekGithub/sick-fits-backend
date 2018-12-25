const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');

const server = createServer();

server.express.use(cookieParser());
// TODO Use express middlware to populate current user
server.express.use((req, res, next) => {
    const { token } = req.cookies;
    if(token) {
        const { userId } = jwt.verify(token, process.env.APP_SECRET);
        // add userID to every future requests
        req.userId = userId;
    }
    next();
})

server.start({
    cors: {
        credentials: true,
        origin: process.env.FRONTEND_URL,
    }
}, deets => {
    console.log(`Server is now running on http://localhost:${deets.port}`)
})