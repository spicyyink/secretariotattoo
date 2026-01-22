require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. SERVIDOR (Mantiene a Render despierto)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// Función auxiliar para obtener el enlace al chat privado
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
    return ctx.reply('🔥 MENÚ SpicyInkk 🔥\nElige una opción:',
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
    ctx.reply(`⛏️ MINERÍA SPICY\n\nLlevas: ${clics}/1000 ml de tinta.\n🎁 PREMIO: REGALO TATTOO MINI 20€\n\n👇 ¡DALE CAÑA! 👇`,
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
        await ctx.editMessageText('🎉 TANQUE LLENO (1000) 🎉\n\nHas ganado un TATTOO MINI de 20€.\nHaz captura de este mensaje y envíamela.');
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`⛏️ MINERÍA SPICY\n\nLlevas: ${db.clics[uid]}/1000 ml de tinta.\n🎁 PREMIO: REGALO TATTOO MINI 20€`,
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

// --- ESCENA IDEAS (BOTONES AMPLIADOS Y PROFESIONALES) ---
const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        bot.telegram.sendMessage(MI_ID, `💡 El usuario ${getUserLink(ctx)} está consultando IDEAS.`, { parse_mode: 'HTML' });
        ctx.reply('💡 CONSULTOR PROFESIONAL\nSelecciona la zona donde tienes pensado tu próximo proyecto:',
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
            'Antebrazo': "💪 **Antebrazo/Exterior:** Es una de las mejores zonas para realismo o Lettering. La visibilidad es alta y el envejecimiento del tatuaje es excelente gracias a la firmeza de la piel.",
            'Hombro': "🏹 **Hombro:** Zona ideal para piezas circulares o de estilo neotradicional. Permite integrar el diseño hacia la clavícula o el brazo para dar mayor fluidez.",
            'Pecho': "🛡️ **Pecho:** Un lienzo amplio que exige diseños simétricos o composiciones de gran impacto. Ten en cuenta que la zona del esternón es más sensible.",
            'Espalda': "🦅 **Espalda:** Ofrece infinitas posibilidades. Recomendamos piezas de gran formato (Full Back) para aprovechar la anatomía y la estabilidad de la piel a largo plazo.",
            'Cuello': "🔥 **Cuello:** Zona de alta visibilidad y estética audaz. Ideal para micro-realismo o diseños minimalistas que sigan la línea de la mandíbula o el trapecio.",
            'Mano': "🤚 **Mano:** Requiere diseños con líneas sólidas y contrastadas. Al ser una zona de mucho desgaste, el cuidado posterior es crítico para mantener la saturación.",
            'Rodilla': "💀 **Rodilla:** Es un reto anatómico. Los diseños geométricos o tradicionales que 'abracen' la rótula funcionan mejor mecánicamente.",
            'Pantorrilla': "🦵 **Pantorrilla:** Una zona muy agradecida para el color y sombras profundas. Permite trabajar detalles minuciosos sin que el diseño se deforme al caminar.",
            'Gemelos': "⚡ **Gemelos:** Perfecto para diseños verticales o alargados. Es una zona muscularmente activa, lo que da mucho dinamismo a piezas orgánicas.",
            'Costillas': "⚖️ **Costillas:** Zona de alta sensibilidad. Recomendamos diseños finos (Fine Line) o composiciones que sigan el arco natural de las costillas para estilizar la figura.",
            'Otros': "✨ **Cualquier zona es un buen lienzo:** Cuéntame tu idea específica en el formulario de contacto para asesorarte sobre la mejor composición anatómica."
        };

        const respuesta = consejos[msg] || "✨ Selecciona una zona para recibir asesoramiento técnico.";
        ctx.reply(respuesta, { parse_mode: 'Markdown' });
        ctx.scene.leave();
        return irAlMenuPrincipal(ctx);
    }
);

// --- ESCENA TATTOO ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { 
        bot.telegram.sendMessage(MI_ID, `📝 El usuario ${getUserLink(ctx)} ha empezado el FORMULARIO.`, { parse_mode: 'HTML' });
        ctx.reply('📝¿Cómo te llamas?👋🏼'); ctx.wizard.state.f = {}; return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞¿Edad?🔞', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('👤¿Zona del cuerpo?🦾', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('💡Describe tu idea💡:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.idea = ctx.message.text; ctx.reply('🖼️¿Estilo?🫟'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('📏Tamaño cm:📐'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('🫀¿Salud/Alergias?🫀💊'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('💉¿Piel (Cicatrices/Lunares)💉?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.piel = ctx.message.text; ctx.reply('🌍¿Horario?📘'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.horario = ctx.message.text; ctx.reply('🎆Envía FOTO o escribe🎆•⚠️"No tengo"⚠️'); return ctx.wizard.next(); },
    (ctx) => {
        ctx.wizard.state.f.foto = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        ctx.reply('📲¿Tu número de WhatsApp?📲 (Ej: 34600000000)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.f.telefono = ctx.message.text.replace(/\s+/g, '');
        ctx.reply('🛜Nombre de Instagram🛜 (Opcional, escribe "No" para saltar):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.ig = ctx.message.text;
        const fichaAdmin = `🖋️ NUEVA SOLICITUD\n\n👤 Nombre: ${d.nombre}\n🔞 Edad: ${d.edad}\n📍 Zona: ${d.zona}\n💡 Idea: ${d.idea}\n🎨 Estilo: ${d.estilo}\n📏 Tam: ${d.tamano}\n🏥 Salud: ${d.salud}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}\n📞 WhatsApp: ${d.telefono}\n📸 Instagram: ${d.ig}`;
        await ctx.reply('✅ Recibido. El Tatuador revisará tu solicitud pronto.');
        const keyboard = Markup.inlineKeyboard([[Markup.button.url('📲 ABRIR WHATSAPP', `https://wa.me/${d.telefono}`)]]);
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
    bot.telegram.sendMessage(MI_ID, `🚀 El usuario ${getUserLink(ctx)} ha iniciado el bot.`, { parse_mode: 'HTML' });
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
        bot.telegram.sendMessage(MI_ID, `👥 ${getUserLink(ctx)} ha entrado como referido de la ID: ${payload}`, { parse_mode: 'HTML' });
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
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No entraste con link de referido.', { show_alert: true });
    await ctx.reply('✅ Reporte enviado. El Tatuador lo validará pronto.');
    await ctx.telegram.sendMessage(MI_ID, `🔔 VALIDACIÓN PENDIENTE\n\nEl usuario ${getUserLink(ctx)} (${uid}) se ha tatuado.\n\nInvitado por: ${sponsorId}`, 
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✅ ACEPTAR', `v_si_${uid}_${sponsorId}`)], [Markup.button.callback('❌ RECHAZAR', `v_no_${uid}`)]]) });
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
    bot.telegram.sendMessage(MI_ID, `👥 El usuario ${getUserLink(ctx)} ha entrado a MIS REFERIDOS.`, { parse_mode: 'HTML' });
    ctx.reply(`👥 ZONA SOCIOS\n\n🔗 Tu Link: https://t.me/SpicyInkBot?start=${uid}\n\n📊 Estadísticas:\n- Clics en link: ${total}\n- Amig@ Tatuado: ${confirmados}/3\n\n🎁 Premio: 50% DTO al llegar a 3 confirmados.\n\n👇 ¿Te has tatuado ya?`,
        Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    );
});

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('🧴 CUIDADOS:\n1. Jabón neutro.\n2. Bepanthol.\n3. Sin sol.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    bot.telegram.sendMessage(MI_ID, `🎁 El usuario ${getUserLink(ctx)} ha entrado a SORTEOS.`, { parse_mode: 'HTML' });
    ctx.reply('🎟️ SORTEO ACTIVO\n\n📅 Fecha: Del 05 al 10 de febrero de 2026.\n👉 Participa aquí: https://t.me/+bAbJXSaI4rE0YzM0');
});

bot.launch().then(() => console.log('🚀 Tatuador Online'));
