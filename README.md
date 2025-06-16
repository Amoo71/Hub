# TRNT App Deployment Guide

This guide explains how to deploy your TRNT application from localhost to Vercel with MongoDB Atlas.

## Prerequisites

1. Create accounts on:
   - [Vercel](https://vercel.com)
   - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)

## Step 1: Set up MongoDB Atlas

1. Create a new MongoDB Atlas account or log in to your existing account
2. Create a new project
3. Create a new cluster (the free tier is sufficient)
4. Set up database access:
   - Create a new database user with password authentication
   - Note down the username and password
5. Set up network access:
   - Add a new IP address: 0.0.0.0/0 (to allow access from anywhere)
6. Get your connection string:
   - Go to "Clusters" > "Connect" > "Connect your application"
   - Copy the connection string (it will look like: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority`)
   - Replace `<username>` and `<password>` with your database user credentials
   - Replace `<database>` with a name for your database (e.g., "trnt-db")

## Step 2: Deploy to Vercel

1. Install Vercel CLI (optional):
   ```
   npm install -g vercel
   ```

2. Log in to Vercel from the terminal:
   ```
   vercel login
   ```

3. Deploy your application:
   ```
   vercel
   ```

   Or deploy directly from the Vercel dashboard:
   - Go to [vercel.com](https://vercel.com)
   - Create a new project
   - Import your GitHub repository or upload your files
   - Configure the project:
     - Build Command: `npm install`
     - Output Directory: `public`
     - Install Command: `npm install`

4. Set up environment variables in Vercel:
   - Go to your project settings
   - Add the following environment variables:
     - `MONGODB_URI`: Your MongoDB connection string
     - `PORT`: 3000 (Vercel will override this)

5. Deploy your application

## Step 3: Verify Deployment

1. Visit your deployed application URL
2. Test all functionality to ensure it works as expected
3. Check the Vercel logs if you encounter any issues

## Troubleshooting

- If you encounter connection issues, verify your MongoDB Atlas connection string and network access settings
- Check Vercel logs for any deployment errors
- Ensure all environment variables are correctly set in Vercel

## Local Development After Setup

To run the application locally after setting up MongoDB:

1. Create a `.env` file in the root directory with:
   ```
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   ```

2. Run the application:
   ```
   npm install
   npm start
   ``` 