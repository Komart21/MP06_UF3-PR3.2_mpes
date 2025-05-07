const WebSocket = require('ws');
const readline = require('readline');
const { MongoClient } = require('mongodb'); 

// Conexión a MongoDB
const uri = 'mongodb://localhost:27017'; 
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
const dbName = 'game_db'; 
let db;

// Connectamos a la base de datos
client.connect()
  .then(() => {
    db = client.db(dbName);
    console.log('Conectado a MongoDB');
  })
  .catch(err => {
    console.error('Error al conectar con MongoDB:', err);
  });

// Connecta al servidor WebSocket
const ws = new WebSocket('ws://localhost:8080');

// Posició inicial del jugador
let pos = { x: 0, y: 0 };

// Última vez que se movió el jugador
let lastMoveTime = Date.now();
let movementInterval = null;

// Función para calcular la distancia
function calculateDistance(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Función para guardar el movimiento en MongoDB
async function saveMovement(x, y) {
    try {
        const collection = db.collection('movements');
        const movement = {
            x,
            y,
            timestamp: new Date(),
        };
        await collection.insertOne(movement);
        console.log(`Moviment guardat a MongoDB: (${x}, ${y})`);
    } catch (error) {
        console.error('Error al guardar el moviment en MongoDB:', error);
    }
}

// Función para iniciar el temporizador de inactividad
function startInactivityTimer() {
    if (movementInterval) {
        clearInterval(movementInterval);
    }

    movementInterval = setInterval(async () => {
        if (Date.now() - lastMoveTime > 10000) {
            console.log('Han passat 10 segons sense moviment. Finalitzant la partida...');

            // Calcular la distancia recorrida y enviar la notificación de finalización
            const distance = calculateDistance({ x: 0, y: 0 }, pos);
            ws.send(JSON.stringify({ type: 'game-over', distance }));

            // Guardamos la finalización en la base de datos
            const collection = db.collection('games');
            await collection.insertOne({
                endTimestamp: new Date(),
                distance: distance,
                status: 'finalized',
            });

            console.log('Partida finalitzada i guardada a MongoDB.');
            process.exit();
        }
    }, 1000);
}

// Al abrir el WebSocket
ws.on('open', () => {
    console.log('Connectat al servidor WebSocket');
    console.log('Utilitza les fletxes per moure el jugador. Espera 10 segons per veure el càlcul de distància.');

    // Configura l'entrada per capturar tecles
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            process.exit();
        }

        switch (key.name) {
            case 'up': pos.y -= 1; break;
            case 'down': pos.y += 1; break;
            case 'left': pos.x -= 1; break;
            case 'right': pos.x += 1; break;
            default: return; // Ignora altres tecles
        }

        // Actualiza la hora del último movimiento
        lastMoveTime = Date.now();

        // Envia la nova posició al servidor
        ws.send(JSON.stringify({ type: 'move', x: pos.x, y: pos.y }));
        console.log(`Moviment enviat: (${pos.x}, ${pos.y})`);

        // Guarda el moviment en MongoDB
        saveMovement(pos.x, pos.y);

        // Inicia el timer de inactivitat
        startInactivityTimer();
    });
});

// Quan es rep la notificació de finalització
ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'game-over') {
        console.log(`🎮 PARTIDA FINALITZADA! Distància recorreguda: ${data.distance}`);
    }
});

ws.on('error', (error) => {
    console.error('Error al connectar al servidor WebSocket', error);
});
