require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. SERVIDOR (Mantiene a Render despierto)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

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
    return ctx.reply('🔥 **MENÚ PRINCIPAL** 🔥\nElige una opción:',
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot', '💉 Minar Tinta'],
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
    ctx.reply(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${clics}/1000** ml de tinta.\n🎁 **PREMIO:** REGALO TATTOO MINI 20€\n\n👇 ¡DALE CAÑA! 👇`,
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
        await ctx.answerCbQuery('🏆 ¡GANASTE!');
        await ctx.editMessageText('🎉 **¡TANQUE LLENO (1000)!** 🎉\n\nHas ganado un **TATTOO MINI de 20€**.\nHaz captura de este mensaje y envíamela.');
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`⛏️ **MINERÍA SPICY**\n\nLlevas: **${db.clics[uid]}/1000** ml de tinta.\n🎁 **PREMIO:** REGALO TATTOO MINI 20€`,
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
        ctx.reply('💡 **CONSULTOR DE IDEAS**\n¿Dónde te quieres tatuar?',
            Markup.keyboard([['Brazo', 'Pierna'], ['Costillas', 'Espalda'], ['⬅️ Cancelar']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg && msg.includes('Cancelar')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        let consejo = "✨ Para esa zona recomiendo diseños fluidos.";
        if (msg === 'Costillas') consejo = "🔥 Zona dolorosa pero sexy.";
        ctx.reply(consejo);
        ctx.scene.leave();
        return irAlMenuPrincipal(ctx);
    }
);

// --- ESCENA TATTOO (FORMULARIO ACTUALIZADO) ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('📝 1️⃣ ¿Cómo te llamas?'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('2️⃣ ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('3️⃣ ¿Zona del cuerpo?', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('4️⃣ Describe tu idea:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('5️⃣ ¿Estilo?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('6️⃣ Tamaño cm:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('7️⃣ ¿Salud/Alergias?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('8️⃣ ¿Piel (Cicatrices/Lunares)?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.piel = ctx.message.text; ctx.reply('9️⃣ ¿Horario?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('🔟 Envía FOTO o escribe "No tengo":'); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        let photo = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        
        // FICHA CON EL FORMATO DE TUS CAPTURAS
        const fichaAdmin = `🖋️ **NUEVA SOLICITUD**\n\n` +
            `👤 **Nombre:** ${d.nombre}\n` +
            `🔞 **Edad:** ${d.edad}\n` +
            `📍 **Zona:** ${d.zona}\n` +
            `💡 **Idea:** ${d.idea}\n` +
            `🎨 **Estilo:** ${d.estilo}\n` +
            `📏 **Tam:** ${d.tamano}\n` +
            `🏥 **Salud:** ${d.salud}\n` +
            `🩹 **Piel:** ${d.piel}\n` +
            `🕒 **Horario:** ${d.horario}`;

        await ctx.reply('✅ Recibido. Revisaremos tu solicitud pronto.');
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, { parse_mode: 'Markdown' });
        if (photo) await ctx.telegram.sendPhoto(MI_ID, photo);
        
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
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

bot.use(stage.middleware());

// ==========================================
// 5. SISTEMA DE VALIDACIÓN DE TATUAJES
// ==========================================

bot.action('reportar_tatuaje', async (ctx) => {
    const uid = ctx.from.id;
    const sponsorId = db.invitados[uid];
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No entraste con link de referido.', { show_alert: true });
    
    await ctx.reply('✅ Reporte enviado. El tatuador lo validará pronto.');
    await ctx.telegram.sendMessage(MI_ID, `🔔 **VALIDACIÓN PENDIENTE**\n\nEl usuario **${ctx.from.first_name}** (${uid}) se ha tatuado.\n\nInvitado por: \`${sponsorId}\``, 
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ ACEPTAR', `v_si_${uid}_${sponsorId}`)],
            [Markup.button.callback('❌ RECHAZAR', `v_no_${uid}`)]
        ])
    );
});

bot.action(/^v_si_(\d+)_(\d+)$/, async (ctx) => {
    const amigoId = ctx.match[1];
    const sponsorId = ctx.match[2];
    db.confirmados[sponsorId] = (db.confirmados[sponsorId] || 0) + 1;
    guardar();
    await ctx.editMessageText(`✅ Validado. Punto para ${sponsorId}.`);
    try { await ctx.telegram.sendMessage(amigoId, '🎉 ¡Tu tatuaje ha sido validado!'); } catch (e) {}
    try { await ctx.telegram.sendMessage(sponsorId, `🔥 ¡Un amig@ invitado se ha tatuado! (${db.confirmados[sponsorId]}/3)`); } catch (e) {}
});

bot.action(/^v_no_(\d+)$/, async (ctx) => {
    await ctx.editMessageText(`❌ Validación rechazada.`);
});

// ==========================================
// 6. LISTENERS GLOBALES
// ==========================================
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    const confirmados = db.confirmados[uid] || 0;
    ctx.reply(`👥 **ZONA SOCIOS**\n\n🔗 **Tu Link:** https://t.me/SpicyInkBot?start=${uid}\n\n📊 **Estadísticas:**\n- Clics en link: ${total}\n- Amig@ Tatuado: ${confirmados}/3\n\n🎁 **Premio:** 50% DTO al llegar a 3 confirmados.\n\n👇 **¿Te has tatuado ya?**`,
        Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    );
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧴 **CUIDADOS:**\n1. Jabón neutro.\n2. Bepanthol.\n3. Sin sol.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🎟️ **SORTEO ACTIVO**\n\n📅 **Fecha:** Del 05 al 10 de febrero de 2026.\n👉 **Participa aquí:** https://t.me/+bAbJXSaI4rE0YzM0');
});

bot.launch().then(() => console.log('🚀 SpicyBot Online'));
