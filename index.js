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
    return ctx.reply('✨ <b>S P I C Y  I N K</b> ✨\n━━━━━━━━━━━━━━━━━━━━\n<i>Gestión de citas y eventos exclusivos.</i>\n\n<b>Selecciona una opción:</b>',
        {
            parse_mode: 'HTML',
            ...Markup.keyboard([
                ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
                ['💡 Consultar Ideas', '👥 Mis Referidos'],
                ['🧼 Cuidados', '🎁 Sorteos']
            ]).resize()
        }
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
    
    ctx.reply(`💉 <b>M I N E R Í A  D E  T I N T A</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📊 <b>Estado:</b> <code>${clics} / 1000 ml</code>\n🎁 <b>Premio:</b> <code>TATTOO MINI 20€</code>\n\n<i>Pulsa el botón inferior para recolectar.</i>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')],
            [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]
        ])
    });
});

mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.answerCbQuery('🏆 ¡OBJETIVO LOGRADO!');
        await ctx.editMessageText('🎉 <b>TANQUE COMPLETADO</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n\nHas recolectado <code>1000ml</code> de tinta.\n\n📸 <b>Haz captura de este mensaje</b> y envíala al Tatuador para canjear tu <b>TATTOO MINI</b>.', { parse_mode: 'HTML' });
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`💉 <b>M I N E R Í A  D E  T I N T A</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📊 <b>Estado:</b> <code>${db.clics[uid]} / 1000 ml</code>\n🎁 <b>Premio:</b> <code>TATTOO MINI 20€</code>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR AL MENÚ', 'volver_menu')]])
        });
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
        ctx.reply('💡 <b>A S E S O R Í A  V I S U A L</b>\n━━━━━━━━━━━━━━━━━━━━\n<i>Selecciona la zona anatómica para recibir información técnica:</i>',
            {
                parse_mode: 'HTML',
                ...Markup.keyboard([
                    ['Antebrazo', 'Hombro', 'Pecho'],
                    ['Espalda', 'Cuello', 'Mano'],
                    ['Rodilla', 'Pantorrilla', 'Gemelos'],
                    ['Costillas', 'Otros', '⬅️ Volver']
                ]).resize()
            });
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (!msg || msg.includes('Volver')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }

        const consejos = {
            'Antebrazo': "💪 <b>Antebrazo:</b> Zona de alta visibilidad. El envejecimiento en esta zona es <code>ÓPTIMO</code> por la firmeza de la piel.",
            'Hombro': "🏹 <b>Hombro:</b> Ideal para diseños circulares. Permite una integración orgánica hacia la clavícula.",
            'Pecho': "🛡️ <b>Pecho:</b> Gran lienzo simétrico. <i>Nota: La zona del esternón presenta mayor sensibilidad.</i>",
            'Espalda': "🦅 <b>Espalda:</b> Máxima estabilidad. Perfecta para piezas de <code>GRAN FORMATO</code> y realismo.",
            'Cuello': "🔥 <b>Cuello:</b> Estética audaz. Recomendamos diseños minimalistas que sigan la línea del trapecio.",
            'Mano': "🤚 <b>Mano:</b> Requiere líneas sólidas. <i>Importante: Zona de alto desgaste por regeneración celular.</i>",
            'Rodilla': "💀 <b>Rodilla:</b> Complejidad técnica media. Diseños geométricos que 'abracen' la rótula son ideales.",
            'Pantorrilla': "🦵 <b>Pantorrilla:</b> Muy agradecida para el color y sombras. Poca deformación visual.",
            'Gemelos': "⚡ <b>Gemelos:</b> La musculatura aporta dinamismo a los diseños verticales.",
            'Costillas': "⚖️ <b>Costillas:</b> Zona elegante. El estilo <code>FINE LINE</code> es el más recomendado aquí.",
            'Otros': "✨ <b>Consultoría:</b> Cualquier zona es apta con la composición correcta. Cuéntame tu idea."
        };

        const respuesta = consejos[msg] || "✨ Selecciona una opción del menú.";
        ctx.reply(respuesta, { parse_mode: 'HTML' });
        ctx.scene.leave();
        return irAlMenuPrincipal(ctx);
    }
);

// --- ESCENA TATTOO ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { 
        bot.telegram.sendMessage(MI_ID, `📝 El usuario ${getUserLink(ctx)} inició el FORMULARIO.`, { parse_mode: 'HTML' });
        ctx.reply('🖋️ <b>F O R M U L A R I O</b>\n━━━━━━━━━━━━━━━━━━━━\n<i>Por favor, indica tu nombre:</i>', { parse_mode: 'HTML' }); 
        ctx.wizard.state.f = {}; return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 <b>¿Edad?</b>', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ <b>ERROR:</b> Mínimo 16 años.'); ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 <b>¿Zona del cuerpo?</b>', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('💡 <b>Describe tu idea:</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('🎨 <b>Estilo visual:</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('📏 <b>Tamaño (cm):</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('🏥 <b>¿Salud / Alergias?</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('💉 <b>¿Cicatrices / Lunares?</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.piel = ctx.message.text; ctx.reply('🕒 <b>Horario preferente:</b>'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('🖼️ <b>Envía FOTO de referencia</b> <i>(o escribe "No")</i>:'); return ctx.wizard.next(); },
    (ctx) => {
        ctx.wizard.state.f.foto = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        ctx.reply('📲 <b>WhatsApp:</b> <i>(Ej: 34600000000)</i>');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.f.telefono = ctx.message.text.replace(/\s+/g, '');
        ctx.reply('🛜 <b>Instagram:</b> <i>(Opcional)</i>');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.ig = ctx.message.text;
        const fichaAdmin = `🖋️ <b>SOLICITUD RECIBIDA</b>\n\n👤 <b>User:</b> ${d.nombre}\n🔞 <b>Edad:</b> ${d.edad}\n📍 <b>Zona:</b> ${d.zona}\n💡 <b>Idea:</b> ${d.idea}\n🎨 <b>Estilo:</b> ${d.estilo}\n📏 <b>Tam:</b> ${d.tamano}\n📞 <b>WA:</b> <code>${d.telefono}</code>\n📸 <b>IG:</b> ${d.ig}`;
        await ctx.reply('✅ <b>SOLICITUD ENVIADA</b>\n━━━━━━━━━━━━━━━━━━━━\n<i>Analizaremos tu propuesta y contactaremos contigo.</i>', { parse_mode: 'HTML' });
        const keyboard = Markup.inlineKeyboard([[Markup.button.url('📲 CONTACTAR WHATSAPP', `https://wa.me/${d.telefono}`)]]);
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, { parse_mode: 'HTML', ...keyboard });
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
    await ctx.reply('✅ <b>REPORTE ENVIADO</b>', { parse_mode: 'HTML' });
    await ctx.telegram.sendMessage(MI_ID, `🔔 <b>VALIDACIÓN</b>\n\nEl usuario ${getUserLink(ctx)} se ha tatuado.\n\nSponsor ID: <code>${sponsorId}</code>`, 
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ ACEPTAR', `v_si_${uid}_${sponsorId}`)], [Markup.button.callback('❌ RECHAZAR', `v_no_${uid}`)]]) });
});

bot.action(/^v_si_(\d+)_(\d+)$/, async (ctx) => {
    const amigoId = ctx.match[1];
    const sponsorId = ctx.match[2];
    db.confirmados[sponsorId] = (db.confirmados[sponsorId] || 0) + 1;
    guardar();
    await ctx.editMessageText(`✅ <b>Validado.</b>`, { parse_mode: 'HTML' });
    try { await ctx.telegram.sendMessage(amigoId, '🎉 <b>¡Tatuaje validado!</b>', { parse_mode: 'HTML' }); } catch (e) {}
    try { await ctx.telegram.sendMessage(sponsorId, `🔥 <b>¡Referido confirmado!</b> (<code>${db.confirmados[sponsorId]}/3</code>)`, { parse_mode: 'HTML' }); } catch (e) {}
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
    
    ctx.reply(`👥 <b>S O C I O S</b>\n━━━━━━━━━━━━━━━━━━━━\n\n🔗 <b>Enlace:</b> <code>https://t.me/SpicyInkBot?start=${uid}</code>\n\n📊 <b>Stats:</b>\n• Clics: <code>${total}</code>\n• Confirmados: <code>${confirmados} / 3</code>\n\n🎁 <b>Premio:</b> <code>50% DTO</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    });
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧼 <b>G U Í A  D E  C U I D A D O S</b>\n━━━━━━━━━━━━━━━━━━━━\n\n1. <b>Limpieza:</b> Jabón neutro 3 veces/día.\n2. <b>Hidratación:</b> Capa fina de pomada específica.\n3. <b>Restricción:</b> <code>NO</code> sol, <code>NO</code> piscinas.', { parse_mode: 'HTML' });
});

bot.hears('🎁 Sorteos', (ctx) => {
    bot.telegram.sendMessage(MI_ID, `🎁 El usuario ${getUserLink(ctx)} entró a SORTEOS.`, { parse_mode: 'HTML' });
    
    const textoSorteo = 
        `✨ <b>S O R T E O  A C T I V O</b> ✨\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏆 <b>PREMIO:</b>\n🥇 <code>TATUAJE VALORADO EN 150€</code>\n\n` +
        `📅 <b>DURACIÓN:</b>\n<code>05 - 10 FEBRERO, 2026</code>\n\n` +
        `🚀 <b>PARTICIPA AQUÍ:</b>\nhttps://t.me/+bAbJXSaI4rE0YzM0\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n<i>Diseño a elección libre del cliente.</i>`;

    ctx.reply(textoSorteo, { parse_mode: 'HTML' });
});

bot.launch().then(() => console.log('🚀 Tatuador Online'));
