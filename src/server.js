const path = require('path');
const { EmailProcessor } = require('./email-processor');

// Update the config path
const processor = new EmailProcessor('../config/config.ini');

// Update the static files path
app.use(express.static(path.join(__dirname, '..', 'public')));

// Update the HTML file path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});