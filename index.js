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

// ==========================================
// CONFIGURACIÓN Y BASES DE DATOS (MEMORIA)
// ==========================================
const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

const db_clics = new Map();
const db_referidos_count = new Map();   // Cuánta gente ha traído al bot
const db_tattoos_confirmados = new Map(); // Cuántos de sus amigos se han tatuado de verdad
const quien_invito_a_quien = new Map(); // Para saber a quién darle el punto cuando alguien se tatúa
const usuarios_registrados = new Set();

// --- ESCENA: MINERÍA (CLICS) ---
const mineScene = new Scenes.WizardScene(
    'mine-scene',
    (ctx) => {
        const userId = ctx.from.id;
        const clics = db_clics.get(userId) || 0;
        ctx.reply(`⛏️ **MODO MINERÍA SPICY**\n\nLlevas: **${clics}/1000** clics.`,
        Markup.keyboard([['⛏️ MINAR'], ['⬅️ Volver']]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const userId = ctx.from.id;
        if (ctx.message.text === '⬅️ Volver') return irAlMenuPrincipal(ctx);
        if (ctx.message.text === '⛏️ MINAR') {
            let clics = (db_clics.get(userId) || 0) + 1;
            db_clics.set(userId, clics);
            if (clics >= 1000) {
                await ctx.reply('🎉 ¡1000 CLICS! Captura y reclama tu mini tattoo.');
                await ctx.telegram.sendMessage(MI_ID, `🏆 @${ctx.from.username} completó minería.`);
                db_clics.set(userId, 0);
                return irAlMenuPrincipal(ctx);
            }
            if (clics % 50 === 0) ctx.reply(`🔥 Llevas ${clics} clics.`);
            return; 
        }
    }
);

// --- ESCENA DE IDEAS (ORIGINAL) ---
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

// --- ESCENA DE PRESUPUESTO (ORIGINAL COMPLETA) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('¡Hola! Soy SpicyBot.\n\n¿Cómo te llamas?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('¿Qué edad tienes?', Markup.keyboard([['Sí, soy mayor', '+16 años'], ['Menor de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const respuestaEdad = ctx.message.text;
        if (respuestaEdad === 'Menor de 16') {
            ctx.reply('Lo siento, el estudio no realiza tatuajes a menores de 16 años.');
            return ctx.scene.leave();
        }
        ctx.wizard.state.formData.edad = respuestaEdad;
        ctx.reply('¿Sufres de alergias o medicación?', Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Cuál es tu número de teléfono?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué diseño tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿Tamaño en cm?', Markup.keyboard([['No lo sé, asesórame']]).oneTime().resize());
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
        ctx.reply('Envíame foto de referencia:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        await ctx.reply('¡Ficha enviada! Te contactaré pronto.', Markup.removeKeyboard());
        const ficha = `🖋️ NUEVA SOLICITUD\n\n👤 Nombre: ${d.nombre}\n🔞 Edad: ${d.edad}\n🏥 Salud: ${d.salud}\n📞 WhatsApp: ${d.telefono}\n💡 Idea: ${d.idea}\n📏 Tamaño: ${d.tamano}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        await ctx.telegram.sendMessage(MI_ID, ficha, {
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
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

// --- LÓGICA DE REFERIDOS Y CONFIRMACIÓN ---
bot.hears('👥 Mis Referidos', (ctx) => {
    const userId = ctx.from.id;
    const invitados = db_referidos_count.get(userId) || 0;
    const confirmados = db_tattoos_confirmados.get(userId) || 0;
    const link = `https://t.me/SpicyInkBot?start=${userId}`;
    
    ctx.reply(`👥 **MIS REFERIDOS**\n\n✅ Amigos en el bot: **${invitados}**\n💉 Tatuajes confirmados: **${confirmados}/3**\n\n🎁 **PREMIO:** ¡Si 3 amigos se tatuán, tienes un **50% DE DESCUENTO**!\n\n🔗 **Tu link:** ${link}`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Ya me he tatuado', 'cliente_confirmar_tattoo')]]));
});

// Cuando el cliente dice que se ha tatuado
bot.action('cliente_confirmar_tattoo', (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    const inviterId = quien_invito_a_quien.get(userId);

    if (!inviterId) {
        return ctx.reply('No has entrado con ningún link de invitado, pero ¡puedes empezar a invitar tú a tus amigos!');
    }

    ctx.reply('Solicitud enviada al tatuador. En cuanto lo confirme, tu amigo recibirá su punto.');
    
    // Te envía el mensaje a ti
    bot.telegram.sendMessage(MI_ID, `⚠️ **CONFIRMACIÓN DE TATTOO**\n\nEl usuario @${username} (ID: ${userId}) dice que se ha tatuado.\n\n¿Confirmas el punto para el amigo que lo invitó?`,
    Markup.inlineKeyboard([
        [Markup.button.callback('✅ SÍ, confirmar', `admin_confirmar_${userId}_${inviterId}`)],
        [Markup.button.callback('❌ NO, cancelar', 'admin_denegar')]
    ]));
});

// Cuando tú (Admin) confirmas el tatuaje
bot.action(/admin_confirmar_(.+)_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const inviterId = parseInt(ctx.match[2]);

    let confirmados = (db_tattoos_confirmados.get(inviterId) || 0) + 1;
    db_tattoos_confirmados.set(inviterId, confirmados);

    await ctx.editMessageText(`✅ Confirmado. Ahora el usuario que invitó tiene ${confirmados} tatuajes confirmados.`);
    
    // Avisar al que invitó
    bot.telegram.sendMessage(inviterId, `🔥 ¡NOTICIÓN! Un amigo tuyo se ha tatuado. Ya llevas **${confirmados}/3** tatuajes confirmados.\n${confirmados >= 3 ? '🏆 ¡HAS GANADO EL 50% DE DESCUENTO! Contacta con el tatuador para tu cita.' : ''}`);
});

bot.action('admin_denegar', (ctx) => ctx.editMessageText('❌ Acción cancelada.'));

// --- OTROS BOTONES ---
bot.hears('🎨 Tipografías', (ctx) => {
    ctx.reply('🖋️ **TIPOGRAFÍAS**', Markup.inlineKeyboard([
        [Markup.button.url('🌐 Dafont', 'https://www.dafont.com/es/')],
        [Markup.button.url('🌐 Google Fonts', 'https://fonts.google.com/')]
    ]));
});

bot.hears('🧼 Cuidados', (ctx) => ctx.reply('✨ **CUIDADOS**\n1. Lava 3 veces/día.\n2. Seca con papel.\n3. Crema fina.', { parse_mode: 'Markdown' }));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎉 **SORTEO**: https://t.me/+bAbJXSaI4rE0YzM0'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('⚡ Revisa mi Instagram para cancelaciones.'));

// --- INICIO Y REFERIDOS ---
const stage = new Scenes.Stage([tattooScene, ideasScene, mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const startPayload = ctx.startPayload; 
    const nuevoUsuario = ctx.from.id;

    if (startPayload && startPayload !== String(nuevoUsuario) && !usuarios_registrados.has(nuevoUsuario)) {
        const referrerId = parseInt(startPayload);
        db_referidos_count.set(referrerId, (db_referidos_count.get(referrerId) || 0) + 1);
        quien_invito_a_quien.set(nuevoUsuario, referrerId); // Guardamos la relación
        usuarios_registrados.add(nuevoUsuario);
        bot.telegram.sendMessage(referrerId, `🔔 ¡Un amigo ha entrado al bot con tu link!`);
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('⛏️ Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Full con Validación de Admin'));
