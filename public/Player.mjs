class Player {
  constructor({x, y, score, id}) {
    this.x = x;
    this.y = y;
    this.score = score || 0;
    this.id = id;
  }

  movePlayer(dir, speed) {
    switch (dir) {
      case 'up':
        this.y -= speed;
        break;
      case 'down':
        this.y += speed;
        break;
      case 'left':
        this.x -= speed;
        break;
      case 'right':
        this.x += speed;
        break;
    }
  }

  collision(item) {
    // Calculate distance between player and item centers
    const distance = Math.sqrt(
      Math.pow(this.x - item.x, 2) + 
      Math.pow(this.y - item.y, 2)
    );
    
    // Return true if collision detected (within 20 pixels)
    return distance < 20;
  }

  calculateRank(arr) {
    // Sort players by score in descending order
    const sortedPlayers = arr.slice().sort((a, b) => b.score - a.score);
    
    // Find current player's rank
    const rank = sortedPlayers.findIndex(player => player.id === this.id) + 1;
    const totalPlayers = arr.length;
    
    return `Rank: ${rank}/${totalPlayers}`;
  }
}

try {
  module.exports = Player;
} catch(e) {}

export default Player;
