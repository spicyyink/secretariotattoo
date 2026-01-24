require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. MOTOR DE ARRANQUE (OPTIMIZADO RENDER)
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Spicy Ink Apex-God v6.0 Online ✅');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Engine started on port ${PORT}`));

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. ARQUITECTURA DE DATOS (PERSISTENCIA)
// ==========================================
let db = { 
    clics: {}, referidos: {}, confirmados: {}, invitados: {}, 
    fichas: {}, puntos: {}, usuarios: [], reseñas: [],
    stats: { citas: 0, prompts: 0, vips: 0 } 
};
const DATA_FILE = path.join('/tmp', 'spicy_ultimate_v6.json');

const cargarDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) }; } catch (e) { console.error("Error al leer DB"); }
    }
};
cargarDB();
const guardar = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

// ==========================================
// 3. CEREBRO LINGÜÍSTICO (DICCIONARIO IA)
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray', 'color': 'full color', 'realismo': 'photorealistic',
        'fine line': 'ultra fine line', 'blackwork': 'heavy blackwork', 'lettering': 'custom calligraphy',
        'tradicional': 'old school traditional', 'neotradicional': 'neo-traditional',
        'acuarela': 'watercolor style', 'puntillismo': 'dotwork style', 'antebrazo': 'forearm',
        'bíceps': 'biceps', 'hombro': 'shoulder', 'costillas': 'ribs', 'esternón': 'sternum',
        'espalda': 'back', 'muslo': 'thigh', 'gemelo': 'calf', 'tobillo': 'ankle', 'mano': 'hand',
        'cuello': 'neck', 'muñeca': 'wrist', 'rodilla': 'knee', 'cara': 'face', 'pies': 'feet',
        'columna': 'spine', 'codo': 'elbow', 'axila': 'armpit', 'lobo': 'wolf', 'león': 'lion',
        'tigre': 'tiger', 'serpiente': 'snake', 'dragón': 'dragon', 'águila': 'eagle', 'búho': 'owl',
        'calavera': 'skull', 'catrina': 'sugar skull catrina', 'mariposa': 'butterfly',
        'fénix': 'phoenix', 'carpa koi': 'koi fish', 'samurái': 'samurai', 'aullando': 'howling',
        'saltando': 'leaping', 'rugiendo': 'roaring', 'corriendo': 'running', 'volando': 'flying',
        'bosque': 'deep forest', 'nubes': 'ethereal clouds', 'mandalas': 'mandala patterns',
        'geometría': 'geometric patterns', 'hiperrealista': 'hyper-realistic masterpiece, 8k',
        'minimalista': 'clean minimalist', 'microrealismo': 'micro-realism'
    };
    let traducido = texto.toLowerCase().trim();
    for (const [es, en] of Object.entries(diccionario)) {
        const regex = new RegExp(`\\b${es}\\b`, 'g');
        traducido = traducido.replace(regex, en);
    }
    return traducido;
}

// ==========================================
// 4. SISTEMA DE FIDELIZACIÓN (STATUS)
// ==========================================
const obtenerStatus = (pts) => {
    if (pts >= 3000) return { n: '👑 ＢＬＡＣＫ ＬＡＢＥＬ', d: '30%', c: '⚫', icon: '🏆' };
    if (pts >= 1500) return { n: '🐉 ＤＲＡＧＯ́Ｎ ＯＲＯ', d: '20%', c: '🟡', icon: '🥇' };
    if (pts >= 500) return { n: '🐺 ＬＯＢＯ ＰＬＡＴＡ', d: '10%', c: '⚪', icon: '🥈' };
    return { n: '🐍 ＳＥＲＰＩＥＮＴＥ', d: '0%', c: '🟢', icon: '🎗' };
};

// ==========================================
// 5. ESCENAS E INTERACTIVIDAD
// ==========================================

// --- MINERÍA DE TINTA ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    ctx.reply(`💉 <b>ＭＩＮＥＲＩ́Ａ ＤＥ ＴＩＮＴＡ</b>\n━━━━━━━━━━━━━━━━━━━━\n🔋 Estado: <code>${db.clics[ctx.from.id] || 0} / 1000 ml</code>\n🎁 <b>PREMIO:</b> TATTOO 20€\n\n<i>Pulsa frenéticamente para inyectar:</i>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_pt')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]) });
});
mineScene.action('minar_pt', async (ctx) => {
    const uid = ctx.from.id; db.clics[uid] = (db.clics[uid] || 0) + 1; guardar();
    if (db.clics[uid] >= 1000) { await ctx.editMessageText('🎉 <b>¡TANQUE COMPLETADO!</b>\nHas ganado tu tatuaje por 20€. Captura esto.', { parse_mode: 'HTML' }); db.clics[uid] = 0; return; }
    try { await ctx.editMessageText(`💉 <b>ＴＩＮＴＡ:</b> <code>${db.clics[uid]} / 1000 ml</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_pt')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]) }); } catch(e){}
    return ctx.answerCbQuery();
});
mineScene.action('volver_menu', (ctx) => { ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

// --- IA CREATOR (CON MODOS) ---
const iaWizard = new Scenes.WizardScene('ia-wizard',
    (ctx) => {
        ctx.wizard.state.ai = {};
        ctx.reply('🎨 <b>ＭＯＤＯ ＤＥ ＤＩＳＥＮ̃Ｏ</b>\nSelecciona el alma de tu tatuaje:', 
            { parse_mode: 'HTML', ...Markup.keyboard([['⚡ Flash Tattoo', '🚬 Estilo Chicano'], ['✨ Blackwork', '🎨 Realismo'], ['⬅️ VOLVER']]).oneTime().resize() });
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === '⬅️ VOLVER') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.ai.modo = ctx.message.text;
        ctx.reply('🤖 <b>Describe tu idea:</b>\n(Ej: Un lobo aullando en el bosque con nubes)');
        return ctx.wizard.next();
    },
    async (ctx) => {
        db.stats.prompts++; guardar();
        const p = `Masterpiece tattoo design, style: ${ctx.wizard.state.ai.modo}, ${traducirTerminos(ctx.message.text)}, white background, ultra-detailed, 8k resolution.`;
        await ctx.reply(`🧠 <b>ＰＲＯＭＰＴ ＧＥＮＥＲＡＤＯ</b>\n━━━━━━━━━━━━━━━━━━━━\n<code>${p}</code>`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.url('🎨 GENERAR EN GEMINI', `https://gemini.google.com/app?q=${encodeURIComponent(p)}`)]])
        });
        return ctx.scene.leave();
    }
);

// --- CITA WIZARD (FORMULARIO LIMPIO) ---
const tattooWizard = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('🖋️ <b>ＮＵＥＶＡ ＣＩＴＡ</b>\n━━━━━━━━━━━━━━━━━━━━\n¿Nombre completo?'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.n = ctx.message.text; ctx.reply('🔞 ¿Edad? (+18 / +16)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.e = ctx.message.text; ctx.reply('📍 Zona del cuerpo y cm aprox:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.z = ctx.message.text; ctx.reply('🎨 Estilo (Fine Line, Realismo...):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.s = ctx.message.text; ctx.reply('🏥 Alergias o salud:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.h = ctx.message.text; ctx.reply('🖼️ Envía foto de referencia:', Markup.inlineKeyboard([[Markup.button.callback('❌ Sin foto', 'no_foto')]])); return ctx.wizard.next(); },
    async (ctx) => {
        if (ctx.message?.photo) { ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id; }
        ctx.reply('📲 WhatsApp (ej: 34600000000):'); return ctx.wizard.next();
    },
    async (ctx) => {
        db.stats.citas++;
        const d = ctx.wizard.state.f; d.w = ctx.message.text.replace(/\D/g, ''); guardar();
        const msg = `🆕 <b>ＣＩＴＡ ＲＥＧＩＳＴＲＡＤＡ</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Nombre:</b> ${d.n}\n📍 <b>Zona:</b> ${d.z}\n🎨 <b>Estilo:</b> ${d.s}\n📞 <b>WhatsApp:</b> +${d.w}\n🆔 <b>ID:</b> <code>${ctx.from.id}</code>`;
        await bot.telegram.sendMessage(MI_ID, msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('📲 HABLAR', `https://wa.me/${d.w}`)]]) });
        if (d.foto) await bot.telegram.sendPhoto(MI_ID, d.foto);
        await ctx.reply('✅ <b>SOLICITUD ENVIADA</b>\nEl tatuador te escribirá pronto por WhatsApp.');
        return ctx.scene.leave();
    }
);

// --- RESEÑAS ---
const feedbackScene = new Scenes.BaseScene('feedback-scene');
feedbackScene.enter((ctx) => ctx.reply('⭐ <b>ＤＥＪＡ ＴＵ ＲＥＳＥＮ̃Ａ</b>\nCuéntanos tu experiencia y gana 10 InkPoints:'));
feedbackScene.on('text', (ctx) => {
    db.reseñas.push({ u: ctx.from.first_name, t: ctx.message.text });
    db.puntos[ctx.from.id] = (db.puntos[ctx.from.id] || 0) + 10; guardar();
    ctx.reply('🙏 <b>¡Gracias!</b> Se han sumado 10 pts a tu cuenta.');
    bot.telegram.sendMessage(MI_ID, `⭐ <b>NUEVA RESEÑA:</b>\n${ctx.message.text}`);
    return ctx.scene.leave();
});

// ==========================================
// 6. MENÚ PRINCIPAL Y NAVEGACIÓN
// ==========================================
function irAlMenuPrincipal(ctx) {
    if (!db.usuarios.includes(ctx.from.id)) { db.usuarios.push(ctx.from.id); guardar(); }
    return ctx.reply('✨ <b>ＳＰＩＣＹ  ＩＮＫ  ＳＴＵＤＩＯ</b> ✨\n━━━━━━━━━━━━━━━━━━━━\n<i>Gestión de citas y eventos exclusivos.</i>',
        { parse_mode: 'HTML', ...Markup.keyboard([
            ['🔥 HABLAR CON TATUADOR', '🤖 IA: ¿QUÉ ME TATÚO?'],
            ['💎 MI STATUS / CLUB', '🎁 PROMOCIONES'],
            ['⚙️ MÁS OPCIONES']
        ]).resize() }
    );
}

bot.hears('⚙️ MÁS OPCIONES', (ctx) => {
    ctx.reply('🛠️ <b>ＨＥＲＲＡＭＩＥＮＴＡＳ ＥＸＴＲＡ</b>', { parse_mode: 'HTML', ...Markup.keyboard([
        ['👥 MIS REFERIDOS', '💉 MINAR TINTA'],
        ['📚 ENCICLOPEDIA', '🧼 CUIDADOS'],
        ['⭐ DEJAR RESEÑA', '⬅️ VOLVER']
    ]).resize() });
});

bot.hears('💎 MI STATUS / CLUB', (ctx) => {
    const pts = db.puntos[ctx.from.id] || 0;
    const s = obtenerStatus(pts);
    ctx.reply(`${s.icon} <b>ＥＳＴＡＤＯ ＤＥ ＣＬＩＥＮＴＥ</b>\n━━━━━━━━━━━━━━━━━━━━\n🏆 Rango: <b>${s.n}</b>\n✨ Puntos: <code>${pts} pts</code>\n💰 DTO Permanente: <b>${s.d}</b>\n\n<i>¡Cada sesión te suma puntos para subir de nivel!</i>`, { parse_mode: 'HTML' });
});

bot.hears('🎁 PROMOCIONES', (ctx) => {
    ctx.reply('🔥 <b>ＰＲＯＭＯＳ ＥＸＣＬＵＳＩＶＡＳ</b>\nÚnete para enterarte de cancelaciones y 2x1:', 
        Markup.inlineKeyboard([[Markup.button.url('🚀 UNIRME AL CANAL', 'https://t.me/+rnjk7xiUjFhlMzdk')]]));
});

bot.hears('📚 ENCICLOPEDIA', (ctx) => {
    ctx.reply('📚 <b>ＧＵＩ́Ａ ＤＥ ＥＳＴＩＬＯＳ</b>\nSelecciona para educar tu piel:', Markup.inlineKeyboard([
        [Markup.button.callback('🚬 Chicano', 'info_chi'), Markup.button.callback('🐍 Blackwork', 'info_bw')],
        [Markup.button.callback('🌸 Fine Line', 'info_fl'), Markup.button.callback('🎨 Realismo', 'info_re')]
    ]));
});

// ==========================================
// 7. ADMINISTRACIÓN (ELITE)
// ==========================================
bot.command('puntos', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    const [_, uid, cant] = ctx.message.text.split(' ');
    db.puntos[uid] = (db.puntos[uid] || 0) + parseInt(cant); guardar();
    ctx.reply(`✅ <b>${cant} pts</b> sumados al usuario <code>${uid}</code>`, { parse_mode: 'HTML' });
    bot.telegram.sendMessage(uid, `💎 ¡Felicidades! Se han sumado <b>${cant} puntos</b> a tu perfil.`, { parse_mode: 'HTML' });
});

bot.command('anuncio', async (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    const msg = ctx.message.text.split(' ').slice(1).join(' ');
    db.usuarios.forEach(id => bot.telegram.sendMessage(id, `📢 <b>ＡＶＩＳＯ ＩＭＰＯＲＴＡＮＴＥ</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${msg}`, { parse_mode: 'HTML' }).catch(e => {}));
    ctx.reply('📢 Anuncio enviado.');
});

bot.command('stats', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    ctx.reply(`📊 <b>ＳＴＡＴＳ ＤＥＬ ＮＥＧＯＣＩＯ</b>\n━━━━━━━━━━━━━━━━━━━━\n👥 Usuarios: ${db.usuarios.length}\n💉 Citas: ${db.stats.citas}\n🤖 Prompts IA: ${db.stats.prompts}`, { parse_mode: 'HTML' });
});

// ==========================================
// 8. MIDDLEWARES Y LANZAMIENTO
// ==========================================
const stage = new Scenes.Stage([tattooWizard, iaWizard, mineScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const text = ctx.message.text;
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != ctx.from.id && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1; guardar();
            bot.telegram.sendMessage(inviterId, `👥 ¡Alguien se ha unido con tu enlace!`);
        }
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 HABLAR CON TATUADOR', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🤖 IA: ¿QUÉ ME TATÚO?', (ctx) => ctx.scene.enter('ia-wizard'));
bot.hears('💉 MINAR TINTA', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('⭐ DEJAR RESEÑA', (ctx) => ctx.scene.enter('feedback-scene'));
bot.hears('🧼 CUIDADOS', (ctx) => ctx.reply('🧼 <b>ＰＲＯＴＯＣＯＬＯ ＤＥ ＣＵＲＡＣＩＯ́Ｎ</b>\n1. Jabón neutro 3 veces/día.\n2. Secar a toquecitos.\n3. Crema fina Spicy Balm.\n4. Cero sol y piscina.', { parse_mode: 'HTML' }));
bot.hears('👥 MIS REFERIDOS', (ctx) => {
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`👥 <b>ＳＩＳＴＥＭＡ ＤＥ ＳＯＣＩＯＳ</b>\n━━━━━━━━━━━━━━━━━━━━\nComparte tu enlace y gana puntos:\n\n🔗 <code>${link}</code>`, { parse_mode: 'HTML' });
});
bot.hears('⬅️ VOLVER', (ctx) => irAlMenuPrincipal(ctx));

bot.launch().then(() => console.log('🔥 SPICY BOT ELITE READY'));
