# TRNT App

## Local Development

1. Install dependencies:
```
npm install
```

2. Create a `.env` file in the root directory with the following content:
```
MONGODB_URI=mongodb+srv://amo:amkamkamk@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs
PORT=3000
NODE_ENV=development
```

3. Start the development server:
```
npm start
```

## Deployment to Vercel

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Add the MongoDB connection string as an environment variable in Vercel:
   - Name: `MONGODB_URI`
   - Value: `mongodb+srv://amo:amkamkamk@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs`
4. Deploy your application

## MongoDB Setup

The application is configured to use MongoDB Atlas. The database will be automatically initialized with sample data on first run.

## Project Structure

- `server.js`: Main server file
- `mongodb.js`: MongoDB connection and models
- `db.js`: Client-side database interactions
- `index.html`: Main application page
- `login.html`: Login page 