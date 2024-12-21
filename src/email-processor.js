

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { MongoClient } = require('mongodb');
const winston = require('winston');
const ini = require('ini');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(__dirname, '..', 'logs', 'email_processor.log')
        }),
        new winston.transports.Console()
    ]
});

class EmailProcessor {
    constructor(configPath) {
        try {
            // Get absolute path to config file
            const fullConfigPath = path.join(__dirname, '..', 'config', configPath);
            
            // Check if config file exists
            if (!fs.existsSync(fullConfigPath)) {
                throw new Error(`Config file not found at: ${fullConfigPath}`);
            }

            // Read config file
            logger.info(`Reading config file from: ${fullConfigPath}`);
            const configFile = fs.readFileSync(fullConfigPath, 'utf-8');
            
            // Parse config file
            this.config = ini.parse(configFile);
            
            // Log config structure (without sensitive data)
            logger.info('Config sections found:', Object.keys(this.config));
            
            // Validate config
            this.validateConfig();
            
            // Initialize database client
            this.dbClient = null;
            this.db = null;

            logger.info('EmailProcessor initialized successfully');
        } catch (error) {
            logger.error(`Error initializing EmailProcessor: ${error.message}`);
            throw error;
        }
    }

    validateConfig() {
        // Check if main sections exist
        if (!this.config.Email) {
            throw new Error('Missing Email section in config file');
        }
        if (!this.config.Database) {
            throw new Error('Missing Database section in config file');
        }

        // Check Email configuration
        const requiredEmailFields = ['imap_server', 'email', 'password'];
        for (const field of requiredEmailFields) {
            if (!this.config.Email[field]) {
                throw new Error(`Missing required Email configuration: ${field}`);
            }
        }

        // Check Database configuration
        const requiredDbFields = ['mongodb_uri', 'database', 'collection'];
        for (const field of requiredDbFields) {
            if (!this.config.Database[field]) {
                throw new Error(`Missing required Database configuration: ${field}`);
            }
        }

        logger.info('Config validation successful');
    }

    generateUniqueMessageId(emailData) {
        // Create a unique message ID if one doesn't exist
        if (!emailData.messageId) {
            const hash = crypto.createHash('md5');
            const uniqueString = `${emailData.sender}-${emailData.subject}-${emailData.timestamp}-${Date.now()}-${Math.random()}`;
            return hash.update(uniqueString).digest('hex');
        }
        return emailData.messageId;
    }

    async processEmail(message) {
        return new Promise((resolve, reject) => {
            simpleParser(message, async (err, parsed) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    // Generate a timestamp that includes milliseconds for more uniqueness
                    const timestamp = new Date();
                    const emailData = {
                        sender: parsed.from?.value[0]?.address || 'unknown',
                        subject: parsed.subject || '[No subject]',
                        timestamp: parsed.date || timestamp,
                        processed_at: timestamp
                    };

                    // Generate a unique message ID
                    emailData.message_id = this.generateUniqueMessageId({
                        messageId: parsed.messageId,
                        sender: emailData.sender,
                        subject: emailData.subject,
                        timestamp: emailData.timestamp
                    });

                    resolve(emailData);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async saveToDatabase(emailData) {
        try {
            const collection = this.db.collection(this.config.Database.collection);
            
            // Add extra check for message_id
            if (!emailData.message_id) {
                throw new Error('Message ID is required');
            }

            await collection.updateOne(
                { message_id: emailData.message_id },
                { 
                    $set: {
                        ...emailData,
                        last_updated: new Date()
                    }
                },
                { upsert: true }
            );
            
            logger.info(`Saved email from ${emailData.sender} to MongoDB with ID: ${emailData.message_id}`);
        } catch (error) {
            logger.error(`Error saving email to database: ${error.message}`);
            throw error;
        }
    }

    async setupDatabase() {
        try {
            this.dbClient = new MongoClient(this.config.Database.mongodb_uri);
            await this.dbClient.connect();
            this.db = this.dbClient.db(this.config.Database.database);
            
            // Drop the existing index if it exists
            try {
                await this.db.collection(this.config.Database.collection)
                    .dropIndex('messageId_1');
            } catch (e) {
                // Ignore error if index doesn't exist
            }

            // Create new index on message_id
            await this.db.collection(this.config.Database.collection)
                .createIndex({ message_id: 1 }, { unique: true });
            
            await this.dbClient.db('admin').command({ ping: 1 });
            logger.info('Successfully connected to MongoDB');
        } catch (error) {
            logger.error(`MongoDB connection error: ${error.message}`);
            throw error;
        }
    }
    async processEmail(message) {
        return new Promise((resolve, reject) => {
            simpleParser(message, async (err, parsed) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    const emailData = {
                        message_id: parsed.messageId || `NO_ID_${Date.now()}`,
                        sender: parsed.from?.value[0]?.address || 'unknown',
                        subject: parsed.subject || '[No subject]',
                        timestamp: parsed.date || new Date(),
                        processed_at: new Date()
                    };
                    resolve(emailData);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async saveToDatabase(emailData) {
        try {
            const collection = this.db.collection(this.config.Database.collection);
            await collection.updateOne(
                { message_id: emailData.message_id },
                { $set: emailData },
                { upsert: true }
            );
            logger.info(`Saved email from ${emailData.sender} to MongoDB`);
        } catch (error) {
            logger.error(`Error saving email to database: ${error.message}`);
            throw error;
        }
    }

    async processUnreadEmails() {
        let imap;
        try {
            imap = await this.connectToEmailServer();
            
            return new Promise((resolve, reject) => {
                imap.once('ready', async () => {
                    try {
                        imap.openBox('INBOX', false, async (err, box) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            imap.search(['UNSEEN'], async (err, results) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }

                                if (!results.length) {
                                    logger.info('No unread emails in the inbox.');
                                    resolve();
                                    return;
                                }

                                const fetch = imap.fetch(results, { bodies: '' });
                                const processPromises = [];

                                fetch.on('message', (msg) => {
                                    const messagePromise = new Promise((resolveMessage) => {
                                        msg.on('body', async (stream) => {
                                            try {
                                                const emailData = await this.processEmail(stream);
                                                await this.saveToDatabase(emailData);
                                                logger.info(`Processed email: ${emailData.subject}`);
                                            } catch (error) {
                                                logger.error(`Error processing email: ${error.message}`);
                                            }
                                            resolveMessage();
                                        });
                                    });
                                    processPromises.push(messagePromise);
                                });

                                fetch.once('error', (err) => {
                                    logger.error(`Fetch error: ${err.message}`);
                                });

                                fetch.once('end', async () => {
                                    await Promise.all(processPromises);
                                    logger.info('Finished processing all emails');
                                    imap.end();
                                    resolve();
                                });
                            });
                        });
                    } catch (error) {
                        reject(error);
                    }
                });

                imap.once('error', (err) => {
                    reject(err);
                });

                imap.connect();
            });
        } catch (error) {
            logger.error(`Error in processUnreadEmails: ${error.message}`);
            if (imap && imap.state !== 'disconnected') {
                imap.end();
            }
            throw error;
        }
    }

    connectToEmailServer() {
        return new Promise((resolve) => {
            const imap = new Imap({
                user: this.config.Email.email,
                password: this.config.Email.password,
                host: this.config.Email.imap_server,
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false }
            });
            resolve(imap);
        });
    }

    async close() {
        if (this.dbClient) {
            await this.dbClient.close();
            logger.info('Database connection closed');
        }
    }
}




async function main() {
    const processor = new EmailProcessor('config.ini');
    try {
        await processor.setupDatabase();
        await processor.processUnreadEmails();
    } catch (error) {
        logger.error(`Critical error in main execution: ${error.message}`);
    } finally {
        await processor.close();
    }
}

module.exports = { EmailProcessor, main };

if (require.main === module) {
    main();
}