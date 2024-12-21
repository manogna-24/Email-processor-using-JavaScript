# Email Processor Project

This project processes unread emails from a Gmail inbox, extracts key information, and stores it in a MongoDB database. The application connects to Gmail via IMAP and MongoDB, processes emails, and saves relevant details (such as sender, subject, and timestamp) to MongoDB.

## Features

- Connects to Gmail via IMAP and fetches unread emails.
- Extracts key email details like sender, subject, and timestamp.
- Stores extracted email data in a MongoDB database.
- Implements error handling and logging.

## Prerequisites

Before running the application, ensure the following:

1. **Node.js and npm** installed on your machine. You can download and install them from [here](https://nodejs.org/).
2. **MongoDB** running locally or on a cloud provider (e.g., MongoDB Atlas).
3. **Gmail account** with IMAP enabled (Enable IMAP in Gmail settings if not already done).

### Install Dependencies

Install the required npm packages by running:

```bash
npm install
```

## Configuration

The project uses a `config.json` file for configuration. Here's an example configuration:

### `config.json`

```json
{
  "imap": {
    "user": "your-email@gmail.com",
    "password": "your-password",
    "host": "imap.gmail.com",
    "port": 993,
    "tls": true,
    "socketTimeout": 30000,
    "connectionTimeout": 30000
  },
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "email_db",
    "collection": "emails"
  }
}
```

- Replace `your-email@gmail.com` and `your-password` with your Gmail credentials.
- MongoDB URI is configured for local use. If using MongoDB Atlas, replace with the appropriate connection string.

### MongoDB Configuration

Make sure to have MongoDB running locally or use MongoDB Atlas (a cloud database). The configuration will connect to the specified `mongodb_uri`, and save the emails in the `email_db` database and `emails` collection.

## Running the Project

1. Ensure that MongoDB is running locally or connected via MongoDB Atlas.
2. Ensure that your email credentials are configured in the `config.json` file.
3. Run the project with the following command:

```bash
node index.js
```

This will start the process of connecting to Gmail, fetching unread emails, and storing them in MongoDB.

## Logs

The application logs the steps and any errors during processing to the console and to a log file (`email_processor.log`). Check the logs for detailed information.

## Error Handling

- If the connection to Gmail or MongoDB fails, the application will log the error.
- The program also handles email parsing errors gracefully and logs them for review.



