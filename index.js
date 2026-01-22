require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. SERVIDOR
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

const getUserLink = (ctx) => {
    const user = ctx.from;
    if (user.username) return `@${user.username}`;
    return `<a href="tg://user?id=${user.id}">${user.first_name}</a>`;
};

// ==========================================
// 2. BASE DE DATOS LOCAL
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {} };
const DATA_FILE = './database.json';

if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) {}
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\nGestión de citas y eventos exclusivos.\n\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '👥 Mis Referidos'],
            ['🧼 Cuidados', '🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 3. DEFINICIÓN DE ESCENAS
// ==========================================

// --- ESCENA MINERÍA ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    const clics = db.clics[uid] || 0;
    bot.telegram.sendMessage(MI_ID, `⛏️ El usuario ${getUserLink(ctx)} ha entrado a MINAR TINTA.`, { parse_mode: 'HTML' });
    
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\n\nEstado: ${clics} / 1000 ml\nPremio: TATTOO MINI 20€\n\nPulsa el botón inferior para recolectar.`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')],
            [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]
        ])
    );
});

mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.answerCbQuery('🏆 OBJETIVO LOGRADO');
        await ctx.editMessageText('🎉 TANQUE COMPLETADO 🎉\n━━━━━━━━━━━━━━━━━━━━\n\nHas recolectado 1000ml de tinta.\nHaz captura de este mensaje y envíala al Tatuador para canjear tu TATTOO MINI.');
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\n\nEstado: ${db.clics[uid]} / 1000 ml\nPremio: TATTOO MINI 20€`,
            Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]]));
    } catch (e) {}
    return ctx.answerCbQuery();
});

mineScene.action('volver_menu', async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
    await ctx.scene.leave();
    return irAlMenuPrincipal(ctx);
});

// --- ESCENA IDEAS ---
const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        bot.telegram.sendMessage(MI_ID, `💡 El usuario ${getUserLink(ctx)} está consultando IDEAS.`, { parse_mode: 'HTML' });
        ctx.reply('💡 A S E S O R Í A  V I S U A L\n━━━━━━━━━━━━━━━━━━━━\nSelecciona la zona anatómica para recibir información técnica:',
            Markup.keyboard([
                ['Antebrazo', 'Hombro', 'Pecho'],
                ['Espalda', 'Cuello', 'Mano'],
                ['Rodilla', 'Pantorrilla', 'Gemelos'],
                ['Costillas', 'Otros', '⬅️ Volver']
            ]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (!msg || msg.includes('Volver')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }

        const consejos = {
            'Antebrazo': "💪 Antebrazo: Zona de alta visibilidad. El envejecimiento en esta zona es ideal por la firmeza de la piel.",
            'Hombro': "🏹 Hombro: Perfecto para diseños circulares. Permite una integración orgánica hacia la clavícula.",
            'Pecho': "🛡️ Pecho: Gran lienzo simétrico. Nota: La zona del esternón presenta mayor sensibilidad.",
            'Espalda': "🦅 Espalda: Máxima estabilidad. Perfecta para piezas de gran formato y realismo.",
            'Cuello': "🔥 Cuello: Estética audaz. Recomendamos diseños minimalistas que sigan la línea del trapecio.",
            'Mano': "🤚 Mano: Requiere líneas sólidas. Importante: Zona de alto desgaste por regeneración celular.",
            'Rodilla': "💀 Rodilla: Complejidad técnica media. Diseños geométricos que envuelvan la rótula son ideales.",
            'Pantorrilla': "🦵 Pantorrilla: Muy agradecida para el color y sombras. Poca deformación visual.",
            'Gemelos': "⚡ Gemelos: La musculatura aporta dinamismo a los diseños verticales.",
            'Costillas': "⚖️ Costillas: Zona elegante. El estilo Fine Line es el más recomendado aquí.",
            'Otros': "✨ Consultoría: Cualquier zona es apta con la composición correcta. Cuéntame tu idea."
        };

        const respuesta = consejos[msg] || "✨ Selecciona una opción del menú.";
        ctx.reply(respuesta);
        ctx.scene.leave();
        return irAlMenuPrincipal(ctx);
    }
);

// --- ESCENA TATTOO ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { 
        bot.telegram.sendMessage(MI_ID, `📝 El usuario ${getUserLink(ctx)} inició el FORMULARIO.`, { parse_mode: 'HTML' });
        ctx.reply('🖋️ F O R M U L A R I O\n━━━━━━━━━━━━━━━━━━━━\nPor favor, indica tu nombre:'); 
        ctx.wizard.state.f = {}; return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ ERROR: Mínimo 16 años.'); ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 ¿Zona del cuerpo?', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('💡 Describe tu idea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('🎨 Estilo visual:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('📏 Tamaño (cm):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('🏥 ¿Salud / Alergias?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('💉 ¿Cicatrices / Lunares?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.piel = ctx.message.text; ctx.reply('🕒 Horario preferente:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('🖼️ Envía FOTO de referencia o escribe "No":'); return ctx.wizard.next(); },
    (ctx) => {
        ctx.wizard.state.f.foto = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        ctx.reply('📲 WhatsApp: (Ej: 34600000000)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.f.telefono = ctx.message.text.replace(/\s+/g, '');
        ctx.reply('🛜 Instagram (Opcional):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.ig = ctx.message.text;
        const fichaAdmin = `🖋️ SOLICITUD RECIBIDA\n\n👤 User: ${d.nombre}\n🔞 Edad: ${d.edad}\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n🎨 Estilo: ${d.estilo}\n📏 Tam: ${d.tamano}\n📞 WA: ${d.telefono}\n📸 IG: ${d.ig}`;
        await ctx.reply('✅ SOLICITUD ENVIADA\n━━━━━━━━━━━━━━━━━━━━\nAnalizaremos tu propuesta y contactaremos contigo.');
        const keyboard = Markup.inlineKeyboard([[Markup.button.url('📲 CONTACTAR WHATSAPP', `https://wa.me/${d.telefono}`)]]);
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, keyboard);
        if (d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto);
        ctx.scene.leave(); return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 4. LÓGICA DE REINICIO (/START)
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene]);
bot.use(session());

bot.start(async (ctx) => {
    if (ctx.scene) { try { await ctx.scene.leave(); } catch(e) {} }
    ctx.session = {}; 
    const payload = ctx.startPayload;
    bot.telegram.sendMessage(MI_ID, `🚀 El usuario ${getUserLink(ctx)} inició el bot.`, { parse_mode: 'HTML' });
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

bot.use(stage.middleware());

// ==========================================
// 5. SISTEMA DE VALIDACIÓN
// ==========================================
bot.action('reportar_tatuaje', async (ctx) => {
    const uid = ctx.from.id;
    const sponsorId = db.invitados[uid];
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No tienes sponsor.', { show_alert: true });
    await ctx.reply('✅ REPORTE ENVIADO');
    await ctx.telegram.sendMessage(MI_ID, `🔔 VALIDACIÓN\n\nEl usuario ${getUserLink(ctx)} se ha tatuado.\n\nSponsor ID: ${sponsorId}`, 
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ ACEPTAR', `v_si_${uid}_${sponsorId}`)], [Markup.button.callback('❌ RECHAZAR', `v_no_${uid}`)]]) });
});

bot.action(/^v_si_(\d+)_(\d+)$/, async (ctx) => {
    const amigoId = ctx.match[1];
    const sponsorId = ctx.match[2];
    db.confirmados[sponsorId] = (db.confirmados[sponsorId] || 0) + 1;
    guardar();
    await ctx.editMessageText(`✅ Validado con éxito.`);
    try { await ctx.telegram.sendMessage(amigoId, '🎉 ¡Tatuaje validado!'); } catch (e) {}
    try { await ctx.telegram.sendMessage(sponsorId, `🔥 ¡Referido confirmado! (${db.confirmados[sponsorId]}/3)`); } catch (e) {}
});

// ==========================================
// 6. LISTENERS GLOBALES
// ==========================================
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    const confirmados = db.confirmados[uid] || 0;
    bot.telegram.sendMessage(MI_ID, `👥 El usuario ${getUserLink(ctx)} entró a REFERIDOS.`, { parse_mode: 'HTML' });
    
    ctx.reply(`👥 S O C I O S\n━━━━━━━━━━━━━━━━━━━━\n\n🔗 Enlace: https://t.me/SpicyInkBot?start=${uid}\n\n📊 Stats:\n• Clics: ${total}\n• Confirmados: ${confirmados} / 3\n\n🎁 Premio: 50% DTO`,
        Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    );
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧼 G U Í A  D E  C U I D A D O S\n━━━━━━━━━━━━━━━━━━━━\n\n1. Limpieza: Jabón neutro 3 veces/día.\n2. Hidratación: Capa fina de pomada específica.\n3. Restricción: NO sol, NO piscinas.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    bot.telegram.sendMessage(MI_ID, `🎁 El usuario ${getUserLink(ctx)} entró a SORTEOS.`, { parse_mode: 'HTML' });
    
    const textoSorteo = 
        `✨ S O R T E O  A C T I V O ✨\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏆 PREMIO:\n🥇 TATUAJE VALORADO EN 150€\n\n` +
        `📅 DURACIÓN:\n05 - 10 FEBRERO, 2026\n\n` +
        `🚀 PARTICIPA AQUÍ:\nhttps://t.me/+bAbJXSaI4rE0YzM0\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\nDiseño a elección libre del cliente.`;

    ctx.reply(textoSorteo);
});

bot.launch().then(() => console.log('🚀 Tatuador Online'));
