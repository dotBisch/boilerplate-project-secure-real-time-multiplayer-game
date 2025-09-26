import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io();
const canvas = document.getElementById('game-window');
const context = canvas.getContext('2d');

// Game state
let players = {};
let collectibles = [];
let currentPlayer = null;

// Canvas setup
canvas.width = 640;
canvas.height = 480;

// Socket event handlers
socket.on('init', (data) => {
  console.log('Game initialized');
  players = data.players;
  collectibles = data.collectibles;
  currentPlayer = new Player(data.players[data.id]);
});

socket.on('new-player', (playerData) => {
  console.log('New player joined:', playerData.id);
  players[playerData.id] = playerData;
});

socket.on('player-update', (data) => {
  if (players[data.id]) {
    // Store target position for smooth interpolation
    players[data.id].targetX = data.x;
    players[data.id].targetY = data.y;
    players[data.id].score = data.score;
    
    // If no current position, snap to target
    if (players[data.id].x === undefined || players[data.id].y === undefined) {
      players[data.id].x = data.x;
      players[data.id].y = data.y;
    }
  }
});

socket.on('player-disconnect', (playerId) => {
  console.log('Player disconnected:', playerId);
  delete players[playerId];
});

socket.on('collectible-update', (data) => {
  // Remove collected item
  collectibles = collectibles.filter(item => item.id !== data.collected);
  
  // Add new collectible
  collectibles.push(data.new);
  
  // Update player score
  if (players[data.player.id]) {
    players[data.player.id].score = data.player.score;
  }
  
  // Update current player if it's them
  if (data.player.id === socket.id && currentPlayer) {
    currentPlayer.score = data.player.score;
  }
});

// Input handling
const keys = {};
let lastMovementTime = 0;
const MOVEMENT_INTERVAL = 16; // ~60 FPS movement updates

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (!keys[key]) {
    keys[key] = true;
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Smooth movement system
function updateMovement() {
  if (!currentPlayer) {
    requestAnimationFrame(updateMovement);
    return;
  }
  
  const now = Date.now();
  if (now - lastMovementTime < MOVEMENT_INTERVAL) {
    requestAnimationFrame(updateMovement);
    return;
  }
  
  const speed = 4; // Slightly slower for smoother movement
  let deltaX = 0;
  let deltaY = 0;
  let moved = false;
  
  // Check for diagonal movement combinations
  if (keys['w'] || keys['arrowup']) {
    deltaY -= speed;
    moved = true;
  }
  if (keys['s'] || keys['arrowdown']) {
    deltaY += speed;
    moved = true;
  }
  if (keys['a'] || keys['arrowleft']) {
    deltaX -= speed;
    moved = true;
  }
  if (keys['d'] || keys['arrowright']) {
    deltaX += speed;
    moved = true;
  }
  
  if (moved) {
    // Normalize diagonal movement to prevent faster diagonal movement
    if (deltaX !== 0 && deltaY !== 0) {
      const factor = Math.sqrt(2) / 2; // ~0.707
      deltaX *= factor;
      deltaY *= factor;
    }
    
    // Update player position
    const newX = currentPlayer.x + deltaX;
    const newY = currentPlayer.y + deltaY;
    
    // Apply boundary constraints
    const constrainedX = Math.max(20, Math.min(620, newX));
    const constrainedY = Math.max(20, Math.min(460, newY));
    
    // Only update if position actually changed
    if (constrainedX !== currentPlayer.x || constrainedY !== currentPlayer.y) {
      currentPlayer.x = constrainedX;
      currentPlayer.y = constrainedY;
      
      // Update local player data
      if (players[socket.id]) {
        players[socket.id].x = currentPlayer.x;
        players[socket.id].y = currentPlayer.y;
      }
      
      // Send movement to server
      socket.emit('movement', { 
        x: currentPlayer.x, 
        y: currentPlayer.y,
        deltaX: deltaX,
        deltaY: deltaY
      });
      
      lastMovementTime = now;
    }
  }
  
  requestAnimationFrame(updateMovement);
}

// Start the movement loop
updateMovement();

// Continuous render loop for smooth animation
function renderLoop() {
  draw();
  requestAnimationFrame(renderLoop);
}

// Start render loop
renderLoop();

// Drawing functions
function draw() {
  // Interpolate other players' positions for smooth movement
  Object.values(players).forEach(player => {
    if (player.id !== socket.id && player.targetX !== undefined && player.targetY !== undefined) {
      const lerpFactor = 0.15; // Interpolation speed
      player.x = player.x + (player.targetX - player.x) * lerpFactor;
      player.y = player.y + (player.targetY - player.y) * lerpFactor;
    }
  });

  // Clear canvas
  context.fillStyle = '#220';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw collectibles
  context.fillStyle = '#FFD700';
  collectibles.forEach(collectible => {
    context.beginPath();
    context.arc(collectible.x, collectible.y, 10, 0, 2 * Math.PI);
    context.fill();
    
    // Draw value text
    context.fillStyle = '#FFF';
    context.font = '12px Arial';
    context.textAlign = 'center';
    context.fillText(collectible.value.toString(), collectible.x, collectible.y - 15);
    context.fillStyle = '#FFD700';
  });
  
  // Draw players
  Object.values(players).forEach(player => {
    // Player color
    const isCurrentPlayer = currentPlayer && player.id === socket.id;
    context.fillStyle = isCurrentPlayer ? '#00FF00' : '#FF0000';
    
    // Draw player as circle
    context.beginPath();
    context.arc(Math.round(player.x), Math.round(player.y), 15, 0, 2 * Math.PI);
    context.fill();
    
    // Draw player ID and score
    context.fillStyle = '#FFF';
    context.font = '10px Arial';
    context.textAlign = 'center';
    context.fillText(`${player.id.substring(0, 6)}`, Math.round(player.x), Math.round(player.y) - 20);
    context.fillText(`Score: ${player.score}`, Math.round(player.x), Math.round(player.y) + 30);
  });
  
  // Draw current player's rank
  if (currentPlayer && Object.keys(players).length > 0) {
    const playersArray = Object.values(players);
    const rank = currentPlayer.calculateRank(playersArray);
    
    context.fillStyle = '#FFF';
    context.font = '16px Arial';
    context.textAlign = 'left';
    context.fillText(rank, 10, 30);
    context.fillText(`Your Score: ${currentPlayer.score}`, 10, 50);
  }
  
  // Draw instructions
  context.fillStyle = '#FFF';
  context.font = '12px Arial';
  context.textAlign = 'left';
  context.fillText('Use WASD or Arrow Keys to move (supports diagonal)', 10, canvas.height - 60);
  context.fillText('Hold multiple keys for diagonal movement!', 10, canvas.height - 40);
  context.fillText('Collect gold items to increase your score!', 10, canvas.height - 20);
}
