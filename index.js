He actualizado el mensaje dentro de la escena de minería y en la actualización de los clics para que el premio (Mini Tattoo de 15€) quede bien claro desde el principio.
Aquí tienes el código completo con la corrección:
require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR DE SALUD
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// BASES DE DATOS TEMPORALES (EN MEMORIA)
const db_clics = new Map();
const db_referidos_count = new Map();
const db_tattoos_confirmados = new Map();
const quien_invito_a_quien = new Map();
const usuarios_registrados = new Set();

// ==========================================
// ESCENA: MINERÍA (CON PREMIO VISIBLE)
// ==========================================
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db_clics.get(userId) || 0;
        
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** Al llegar a los 1000 clics ganas un **MINI TATTOO valorado en 15€**.\n\n¡Pulsa el botón de abajo para minar!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR PUNTO!', 'minar_punto')],
            [Markup.button.callback('⬅️ Menú Principal', 'volver_menu')]
        ]));
        return ctx.wizard.next();
    },
    (ctx) => { return; }
);

// Lógica de actualización de clics
bot.action('minar_punto', async (ctx) => {
    const userId = ctx.from.id;
    let clics = (db_clics.get(userId) || 0) + 1;
    db_clics.set(userId, clics);

    if (clics >= 1000) {
        await ctx.answerCbQuery('¡OBJETIVO LOGRADO! 🎉');
        await ctx.editMessageText(`🎉 **¡ENHORABUENA!**\n\nHas completado los 1000 clics.\n\n🎁 Has ganado un **MINI TATTOO de 15€**.\n\n📸 **CAPTURA** esta pantalla ahora mismo y envíasela al tatuador por privado para canjear tu premio.`);
        await ctx.telegram.sendMessage(MI_ID, `🏆 @${ctx.from.username} ha completado los 1000 clics y reclama su mini tattoo.`);
        db_clics.set(userId, 0);
        return;
    }

    try {
        await ctx.editMessageText(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.\n\n🎁 **PREMIO:** MINI TATTOO de 15€.\n\n¡Sigue dándole!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('⛏️ ¡MINAR PUNTO!', 'minar_punto')],
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
// RESTO DE ESCENAS (IDEAS Y FORMULARIO)
// ==========================================

const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('¿En qué zona estás pensando?',
            Markup.keyboard([['Rodilla', 'Codo', 'Cuello'], ['Tríceps', 'Bíceps', 'Antebrazo'], ['⬅️ Volver']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const zona = ctx.message.text ? ctx.message.text.toLowerCase() : '';
        if (zona.includes('volver')) return irAlMenuPrincipal(ctx);
        ctx.reply('🌟 Mi consejo: Para esa zona busca algo que fluya con tu anatomía.');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('¡Hola! Soy SpicyBot.\n¿Cómo te llamas?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('¿Qué edad tienes?', Markup.keyboard([['Sí, soy mayor', '+16 años'], ['Menor de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') {
            ctx.reply('Lo siento, el estudio no realiza tatuajes a menores de 16 años.');
            return ctx.scene.leave();
        }
        ctx.wizard.state.formData.edad = ctx.message.text;
        ctx.reply('¿Sufres de alergias o medicación?', Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Número de teléfono?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué diseño tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿Tamaño en cm?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('¿Cicatrices o lunares?', Markup.keyboard([['Piel limpia', 'Tengo cicatrices/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.piel = ctx.message.text;
        ctx.reply('¿Horario?', Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.horario = ctx.message.text;
        ctx.reply('Foto de referencia:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('¡Ficha enviada! Te contactaré pronto.', Markup.removeKeyboard());
        const ficha = `🖋️ NUEVA SOLICITUD\n\n👤 Nombre: ${d.nombre}\n🔞 Edad: ${d.edad}\n🏥 Salud: ${d.salud}\n📞 WhatsApp: ${d.telefono}\n💡 Idea: ${d.idea}\n📏 Tamaño: ${d.tamano}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        await ctx.telegram.sendMessage(MI_ID, ficha, {
            ...Markup.inlineKeyboard([[Markup.button.url('💬 WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
        });
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);
        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '⛏️ Minar Tinta'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎨 Tipografías', '🎁 Sorteos'],
            ['📅 Huecos Libres', '👥 Mis Referidos']
        ]).resize());
}

// --- LÓGICA DE REFERIDOS Y VALIDACIÓN ---
bot.hears('👥 Mis Referidos', (ctx) => {
    const userId = ctx.from.id;
    const invitados = db_referidos_count.get(userId) || 0;
    const confirmados = db_tattoos_confirmados.get(userId) || 0;
    const link = `https://t.me/SpicyInkBot?start=${userId}`;
    
    ctx.reply(`👥 **MIS REFERIDOS**\n\n✅ Amigos en el bot: **${invitados}**\n💉 Tatuajes confirmados: **${confirmados}/3**\n\n🎁 **PREMIO:** ¡Si 3 amigos se tatuán, tienes un **50% DE DESCUENTO**!\n\n🔗 **Tu link:** ${link}`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Ya me he tatuado', 'cliente_confirmar_tattoo')]]));
});

bot.action('cliente_confirmar_tattoo', (ctx) => {
    const userId = ctx.from.id;
    const inviterId = quien_invito_a_quien.get(userId);
    if (!inviterId) return ctx.reply('No has entrado con link de invitado.');
    
    ctx.reply('Solicitud de validación enviada.');
    bot.telegram.sendMessage(MI_ID, `⚠️ **VALIDAR TATTOO**\nUsuario: @${ctx.from.username}\n¿Confirmas el punto para el amigo?`,
    Markup.inlineKeyboard([
        [Markup.button.callback('✅ SÍ', `admin_confirmar_${userId}_${inviterId}`)],
        [Markup.button.callback('❌ NO', 'admin_denegar')]
    ]));
});

bot.action(/admin_confirmar_(.+)_(.+)/, async (ctx) => {
    const inviterId = parseInt(ctx.match[2]);
    let confirmados = (db_tattoos_confirmados.get(inviterId) || 0) + 1;
    db_tattoos_confirmados.set(inviterId, confirmados);
    await ctx.editMessageText(`✅ Punto confirmado (${confirmados}/3).`);
    bot.telegram.sendMessage(inviterId, `🔥 ¡Punto de tatuaje confirmado! Llevas **${confirmados}/3**.`);
});

bot.action('admin_denegar', (ctx) => ctx.editMessageText('❌ Denegado.'));

// --- OTROS BOTONES ---
bot.hears('🎨 Tipografías', (ctx) => {
    ctx.reply('🖋️ **TIPOGRAFÍAS**', Markup.inlineKeyboard([
        [Markup.button.url('🌐 Dafont', 'https://www.dafont.com/es/')],
        [Markup.button.url('🌐 Google Fonts', 'https://fonts.google.com/')]
    ]));
});

bot.hears('🧼 Cuidados', (ctx) => ctx.reply('✨ **CUIDADOS**\n1. Lava 3 veces/día.\n2. Seca con papel.\n3. Crema fina.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎉 **SORTEOS**: https://t.me/+bAbJXSaI4rE0YzM0'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('⚡ Mira mi Instagram.'));

// --- INICIO ---
const stage = new Scenes.Stage([tattooScene, ideasScene, mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const startPayload = ctx.startPayload; 
    const nuevoUsuario = ctx.from.id;
    if (startPayload && startPayload !== String(nuevoUsuario) && !usuarios_registrados.has(nuevoUsuario)) {
        const referrerId = parseInt(startPayload);
        db_referidos_count.set(referrerId, (db_referidos_count.get(referrerId) || 0) + 1);
        quien_invito_a_quien.set(nuevoUsuario, referrerId);
        usuarios_registrados.add(nuevoUsuario);
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Operativo con Minería Informada'));

