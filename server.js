require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const expect = require('chai');
const socket = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();

// Configure Helmet for security headers
app.use(helmet.noSniff()); // X-Content-Type-Options: nosniff
app.use(helmet.xssFilter()); // X-XSS-Protection: 1; mode=block
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' })); // Fake X-Powered-By header

// Set cache control headers manually for helmet v3
app.use((req, res, next) => {
  res.set({
    'Surrogate-Control': 'no-store',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//For FCC testing purposes and enables user to connect from outside the hosting platform
app.use(cors({origin: '*'})); 

// Health check endpoint for Railway
app.route('/health')
  .get(function (req, res) {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

// Index page (static HTML)
app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  }); 

//For FCC testing purposes
fccTestingRoutes(app);
    
// 404 Not Found Middleware
app.use(function(req, res, next) {
  res.status(404)
    .type('text')
    .send('Not Found');
});

const portNum = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// Set up server and tests
const server = app.listen(portNum, host, () => {
  console.log(`✅ Server successfully started!`);
  console.log(`🌐 Listening on ${host}:${portNum}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV==='test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${portNum} is already in use`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Game state
const players = {};
const collectibles = [];
let nextCollectibleId = 1;

// Socket.IO setup with Railway-compatible configuration
const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Create initial collectibles
function createCollectible() {
  return {
    x: Math.floor(Math.random() * 600) + 20,
    y: Math.floor(Math.random() * 440) + 20,
    value: Math.floor(Math.random() * 5) + 1,
    id: nextCollectibleId++
  };
}

// Initialize some collectibles
for (let i = 0; i < 3; i++) {
  collectibles.push(createCollectible());
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create new player
  const newPlayer = {
    x: Math.floor(Math.random() * 600) + 20,
    y: Math.floor(Math.random() * 440) + 20,
    score: 0,
    id: socket.id
  };
  
  players[socket.id] = newPlayer;

  // Send initial game state to new player
  socket.emit('init', {
    id: socket.id,
    players: players,
    collectibles: collectibles
  });

  // Broadcast new player to all other players
  socket.broadcast.emit('new-player', newPlayer);

  // Handle player movement
  socket.on('movement', (data) => {
    if (players[socket.id]) {
      const player = players[socket.id];
      
      // Update player position with smooth coordinates (with boundary checks)
      if (data.x !== undefined && data.y !== undefined) {
        player.x = Math.max(20, Math.min(620, data.x));
        player.y = Math.max(20, Math.min(460, data.y));
      } else {
        // Fallback to old system if needed
        const speed = data.speed || 4;
        switch (data.direction) {
          case 'up':
            player.y = Math.max(20, player.y - speed);
            break;
          case 'down':
            player.y = Math.min(460, player.y + speed);
            break;
          case 'left':
            player.x = Math.max(20, player.x - speed);
            break;
          case 'right':
            player.x = Math.min(620, player.x + speed);
            break;
        }
      }

      // Check for collectible collisions
      for (let i = collectibles.length - 1; i >= 0; i--) {
        const collectible = collectibles[i];
        const distance = Math.sqrt(
          Math.pow(player.x - collectible.x, 2) + 
          Math.pow(player.y - collectible.y, 2)
        );
        
        if (distance < 20) { // Collision detected
          player.score += collectible.value;
          collectibles.splice(i, 1);
          
          // Create new collectible to replace the collected one
          collectibles.push(createCollectible());
          
          // Broadcast collectible update
          io.emit('collectible-update', {
            collected: collectible.id,
            new: collectibles[collectibles.length - 1],
            player: {
              id: socket.id,
              score: player.score
            }
          });
        }
      }

      // Broadcast player position update (throttled to prevent spam)
      socket.broadcast.emit('player-update', {
        id: socket.id,
        x: player.x,
        y: player.y,
        score: player.score
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('player-disconnect', socket.id);
  });
});

module.exports = app; // For testing
