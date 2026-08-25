require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(` 
        DCGS Server Running
        Port: ${PORT}
        Environment:  ${process.env.NODE_ENV || 'development'}
    `);
});