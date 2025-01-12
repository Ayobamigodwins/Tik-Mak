require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // Added CORS for frontend-backend communication

const app = express();
const port = 5000;

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors());

// Serve static files (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Load Mongo URI from environment variables
const mongoURI = process.env.MONGO_URI;
console.log("Mongo URI: ", mongoURI); // Debugging line to ensure .env is loaded correctly

if (!mongoURI) {
  console.error('Error: MongoDB URI is not set in .env file');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Define a video schema
const videoSchema = new mongoose.Schema({
  filename: String,
  filepath: String,
  user: String, // Store user ID or username
  likes: { type: Number, default: 0 }, // Like counter
  ratings: [Number], // Array to store individual ratings
  averageRating: { type: Number, default: 0 }, // Store average rating
});

const Video = mongoose.model('Video', videoSchema);

// Set up multer for video file storage
const upload = multer({
  dest: 'uploads/', // Directory to save uploaded videos
  limits: {
    fileSize: 50 * 1024 * 1024, // Max file size of 50 MB
  },
  fileFilter: (req, file, cb) => {
    const fileTypes = /mp4|mov|avi/; // Allowed file types
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('File type not supported'));
  },
});

// Route to sign up (just a placeholder for now)
app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  // You can add your sign-up logic here
  res.status(201).json({ message: 'User signed up successfully' });
});

// Route to log in and issue a token
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  // Check if email and password match your DB (for simplicity, we skip this here)
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Create JWT token
  res.json({ token });
});

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ message: 'Access denied' });

  jwt.verify(token, 'secretkey', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Route to handle video upload
app.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const video = new Video({
    filename: req.file.originalname,
    filepath: `uploads/${req.file.filename}`,
    user: req.user.email,
  });

  try {
    await video.save();
    res.json({ message: 'File uploaded successfully', video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save video in database' });
  }
});

// Route to fetch all videos (without requiring authentication)
app.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find({});
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch videos' });
  }
});

// Route to search for videos by filename
app.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ message: 'Query parameter is required' });

  try {
    const videos = await Video.find({
      filename: { $regex: query, $options: 'i' }, // Case-insensitive search
    });
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ message: 'Error searching videos' });
  }
});

// Route to like a video
app.post('/like/:id', authenticateToken, async (req, res) => {
  const videoId = req.params.id;

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    video.likes += 1; // Increment like counter
    await video.save();
    res.json({ message: 'Video liked successfully', video });
  } catch (err) {
    res.status(500).json({ message: 'Error liking video' });
  }
});

// Route to rate a video
app.post('/rate/:id', authenticateToken, async (req, res) => {
  const videoId = req.params.id;
  const { rating } = req.body;

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  try {
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    video.ratings.push(rating); // Add the rating to the array
    video.averageRating = video.ratings.reduce((sum, rate) => sum + rate, 0) / video.ratings.length; // Update average rating
    await video.save();

    res.json({ message: 'Video rated successfully', video });
  } catch (err) {
    res.status(500).json({ message: 'Error rating video' });
  }
});

// Serve static files (uploaded videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});