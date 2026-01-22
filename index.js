require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const fs = require('fs'); // Para guardar los datos en un archivo
const http = require('http');

// Servidor de salud
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// ==========================================
// SISTEMA DE PERSISTENCIA (ARCHIVO LOCAL)
// ==========================================
let db_clics = {};
const DATA_FILE = './clics.json';

// Cargar datos al iniciar
if (fs.existsSync(DATA_FILE)) {
    db_clics = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// Función para guardar datos
function guardarDatos() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db_clics, null, 2));
}

// ==========================================
// ESCENA: MINERÍA PERSISTENTE
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db_clics[userId] || 0; // Recuperar clics guardados
        
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡Dale al botón para sumar!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => { return; } 
);

// Lógica de actualización de puntos (Sin Lag)
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    
    // Sumar y guardar permanentemente
    db_clics[userId] = (db_clics[userId] || 0) + 1;
    guardarDatos(); 

    let clics = db_clics[userId];

    if (clics >= 1000) {
        await ctx.answerCbQuery('¡OBJETIVO LOGRADO! 🎉');
        await ctx.editMessageText(`🎉 **¡ENHORABUENA!**\n\nHas llegado a los 1000 clics.\n🎁 Has ganado un **MINI TATTOO de 15€**.\n\n📸 Captura esta pantalla y envíasela al tatuador.`);
        db_clics[userId] = 0; // Reiniciar tras ganar
        guardarDatos();
        return;
    }

    try {
        // Editamos el mismo mensaje para que no haya lag ni spam
        await ctx.editMessageText(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡No te detengas!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
        await ctx.answerCbQuery(); 
    } catch (e) {
        await ctx.answerCbQuery();
    }
});

bot.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    return irAlMenuPrincipal(ctx);
});

// ==========================================
// NAVEGACIÓN Y MENÚ
// ==========================================
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Selecciona una opción:', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos']
        ]).resize());
}

const stage = new Scenes.Stage([mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.reply('Formulario en mantenimiento. Usa Minería mientras tanto.'));

bot.launch().then(() => console.log('🚀 Minería persistente activada'));
