require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR PARA EVITAR QUE SE APAGUE
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; // Tu ID de Telegram (debe estar en las variables de entorno)

// BASES DE DATOS EN MEMORIA
const db_clics = new Map();
const db_referidos_count = new Map();
const db_tattoos_confirmados = new Map();
const quien_invito_a_quien = new Map();
const usuarios_registrados = new Set();

// ==========================================
// ESCENA: MINERÍA (INTERFAZ LIMPIA)
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db_clics.get(userId) || 0;
        
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\n` +
                  `Llevas: **${clics}/1000** clics.\n\n` +
                  `🎁 **PREMIO:** Al llegar a 1000 clics ganas un **MINI TATTOO de 15€**.\n\n` +
                  `¡Dale al botón para sumar puntos!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Volver al Menú', 'volver_menu')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => { return; } // Ignora texto, solo escucha botones
);

// Lógica de los botones de minería
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    let clics = (db_clics.get(userId) || 0) + 1;
    db_clics.set(userId, clics);

    if (clics >= 1000) {
        await ctx.answerCbQuery('¡OBJETIVO LOGRADO! 🎉');
        await ctx.editMessageText(`🎉 **¡BRUTAL!**\n\nHas completado los 1000 clics.\n\n🎁 Has ganado un **MINI TATTOO de 15€**.\n\n📸 **CAPTURA** esta pantalla y envíasela al tatuador para canjear tu premio.`);
        await ctx.telegram.sendMessage(MI_ID, `🏆 @${ctx.from.username} (ID: ${userId}) ha completado los 1000 clics.`);
        db_clics.set(userId, 0); // Reinicia tras ganar
        return;
    }

    // Actualiza el mensaje actual sin crear spam
    try {
        await ctx.editMessageText(`⛏️ **MODO MINERÍA SPICY**\n\n` +
                                 `Llevas: **${clics}/1000** clics.\n\n` +
                                 `🎁 **PREMIO:** MINI TATTOO de 15€.\n\n` +
                                 `¡Sigue dándole, ya falta menos!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR!', 'minar_punto')],
            [Markup.button.callback('⬅️ Volver al Menú', 'volver_menu')]
        ]));
        await ctx.answerCbQuery(); 
    } catch (e) {
        // Evita error si el usuario pulsa demasiado rápido
        await ctx.answerCbQuery();
    }
});

bot.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage(); // Limpia el mensaje de minería
    return irAlMenuPrincipal(ctx);
});

// ==========================================
// MENÚ Y OTRAS FUNCIONES
// ==========================================

function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️\nSelecciona una opción:', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎨 Tipografías', '🎁 Sorteos'],
            ['📅 Huecos Libres', '👥 Mis Referidos']
        ]).resize());
}

// Escena de Presupuesto (Formulario)
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => { ctx.reply('¿Cómo te llamas?'); return ctx.wizard.next(); },
    (ctx) => { 
        ctx.wizard.state.nombre = ctx.message.text;
        ctx.reply('¿Qué edad tienes?', Markup.keyboard([['Sí, soy mayor', '+16 años'], ['Menor de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    // ... (Aquí irían el resto de pasos de tu formulario original)
    async (ctx) => {
        await ctx.reply('¡Ficha enviada!');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// Lógica de Referidos
bot.hears('👥 Mis Referidos', (ctx) => {
    const userId = ctx.from.id;
    const invitados = db_referidos_count.get(userId) || 0;
    const confirmados = db_tattoos_confirmados.get(userId) || 0;
    const link = `https://t.me/SpicyInkBot?start=${userId}`;
    
    ctx.reply(`👥 **MIS REFERIDOS**\n\n✅ Amigos invitados: **${invitados}**\n💉 Tattoos confirmados: **${confirmados}/3**\n\n🎁 **RECOMPENSA:** Si 3 amigos se tatúan, ¡tienes un **50% DE DESCUENTO**!\n\n🔗 **Tu link:** ${link}`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Ya me he tatuado', 'cliente_confirmar_tattoo')]]));
});

// Validación de Tatuaje (Admin)
bot.action('cliente_confirmar_tattoo', (ctx) => {
    const userId = ctx.from.id;
    const inviterId = quien_invito_a_quien.get(userId);
    if (!inviterId) return ctx.reply('No entraste con link de invitado.');
    
    ctx.reply('Solicitud de validación enviada al tatuador.');
    bot.telegram.sendMessage(MI_ID, `⚠️ **VALIDAR TATTOO**\nUsuario: @${ctx.from.username}\n¿Confirmas el trabajo para dar el punto?`,
    Markup.inlineKeyboard([
        [Markup.button.callback('✅ SÍ', `admin_confirmar_${userId}_${inviterId}`)],
        [Markup.button.callback('❌ NO', 'admin_denegar')]
    ]));
});

bot.action(/admin_confirmar_(.+)_(.+)/, async (ctx) => {
    const inviterId = parseInt(ctx.match[2]);
    let total = (db_tattoos_confirmados.get(inviterId) || 0) + 1;
    db_tattoos_confirmados.set(inviterId, total);
    await ctx.editMessageText(`✅ Punto confirmado. El invitador lleva ${total}/3.`);
    bot.telegram.sendMessage(inviterId, `🔥 ¡Punto confirmado! Ya llevas **${total}/3** tatuajes de amigos.`);
});

// Botones directos
bot.hears('🎨 Tipografías', (ctx) => {
    ctx.reply('🖋️ **ENCUENTRA TU FUENTE**', Markup.inlineKeyboard([
        [Markup.button.url('🌐 Dafont', 'https://www.dafont.com/es/')],
        [Markup.button.url('🌐 Google Fonts', 'https://fonts.google.com/')]
    ]));
});

// Iniciar Bot
const stage = new Scenes.Stage([tattooScene, mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !usuarios_registrados.has(ctx.from.id)) {
        const refId = parseInt(payload);
        db_referidos_count.set(refId, (db_referidos_count.get(refId) || 0) + 1);
        quien_invito_a_quien.set(ctx.from.id, refId);
        usuarios_registrados.add(ctx.from.id);
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));

bot.launch().then(() => console.log('🚀 SpicyBot desplegado con éxito'));
