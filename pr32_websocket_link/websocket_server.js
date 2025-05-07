const WebSocket = require('ws');
const { MongoClient } = require('mongodb');
const winston = require('winston');

// Configurar logging amb Winston
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Connexió a MongoDB
const mongoClient = new MongoClient("mongodb://localhost:27017");
let db;
let movementCollection;

mongoClient.connect()
  .then(client => {
    logger.info('Conectat a MongoDB');
    db = client.db('gameDB');
    movementCollection = db.collection('movements');
  })
  .catch(err => {
    logger.error('Error de connexió a MongoDB: ', err);
    process.exit(1);
  });

// Crear servidor WebSocket
const wss = new WebSocket.Server({ port: 8080 });

let playerPosition = { x: 0, y: 0 };
let lastMoveTime = Date.now();
let playerGameId = null;

wss.on('connection', (ws) => {
  logger.info('Client connectat');

  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if (data.type === 'move') {
      const { x, y } = data;

      // Actualitzar la posició del jugador
      playerPosition = { x, y };
      lastMoveTime = Date.now();

      // Si el jugador ja està en una partida, emmagatzemar el moviment a MongoDB
      if (playerGameId) {
        await movementCollection.insertOne({
          gameId: playerGameId,
          position: { x, y },
          timestamp: new Date()
        });
      }

      logger.info(`Moviment: (${x}, ${y})`);

      // Enviar la nova posició al client
      ws.send(JSON.stringify({ type: 'position', x, y }));
    }
  });

  // Comprovació d'inactivitat
  setInterval(async () => {
    if (Date.now() - lastMoveTime > 10000) {
      logger.info('El jugador ha estat inactiu durant 10 segons, finalitzant partida');
      
      // Calcular la distància entre el punt inicial i final
      const distance = Math.sqrt(Math.pow(playerPosition.x - 0, 2) + Math.pow(playerPosition.y - 0, 2));

      // Enviar informació de la partida finalitzada
      ws.send(JSON.stringify({ type: 'game-over', distance }));

      // Reiniciar el jugador
      playerPosition = { x: 0, y: 0 };
      playerGameId = null; // Finalitzar la partida
    }
  }, 1000); // Comprovació cada segon
});

logger.info('Servidor WebSocket escoltant al port 8080');
