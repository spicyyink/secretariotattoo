require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. SERVIDOR DE ALTA DISPONIBILIDAD
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Spicy Ink System: Operational ✅');
});
server.listen(process.env.PORT || 3000, '0.0.0.0');

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS PRO (PERSISTENCIA TOTAL)
// ==========================================
let db = { 
    clics: {}, referidos: {}, confirmados: {}, invitados: {}, 
    fichas: {}, puntos: {}, usuarios: [], reseñas: [],
    stats: { citas: 0, prompts: 0 } 
};
const DATA_FILE = path.join('/tmp', 'spicy_master_db.json');

const cargarDB = () => {
    if (fs.existsSync(DATA_FILE)) {
        try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) }; } catch (e) {}
    }
};
cargarDB();
const guardar = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

// ==========================================
// 3. CEREBRO DE TRADUCCIÓN (DICCIONARIO COMPLETO ORIGINAL)
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
// 4. LÓGICA DE RANGOS Y PRECIOS
// ==========================================
const obtenerRango = (pts) => {
    if (pts >= 3000) return { n: '👑 BLACK LABEL', d: '30%', c: '⚫' };
    if (pts >= 1500) return { n: '🐉 DRAGÓN ORO', d: '20%', c: '🟡' };
    if (pts >= 500) return { n: '🐺 LOBO PLATA', d: '10%', c: '⚪' };
    return { n: '🐍 SERPIENTE', d: '0%', c: '🟢' };
};

function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    let base = (cms <= 5) ? "30€" : (cms <= 10) ? "65€-85€" : (cms <= 14) ? "90€-110€" : "120€-200€";
    return `Estimado: ${base}\n⚠️ Sujeto a cambios por el tatuador.`;
}

// ==========================================
// 5. ESCENAS: IA, CITAS Y MINERÍA
// ==========================================

// --- MINERÍA (Ink Game) ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    ctx.reply(`💉 **MINERÍA DE TINTA**\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[ctx.from.id] || 0} / 1000 ml\n🎁 PREMIO: TATTOO 20€`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar')], [Markup.button.callback('⬅️ SALIR', 'volver')]]));
});
mineScene.action('minar', async (ctx) => {
    const uid = ctx.from.id; db.clics[uid] = (db.clics[uid] || 0) + 1; guardar();
    if (db.clics[uid] >= 1000) { await ctx.editMessageText('🎉 ¡TANQUE LLENO! Tattoo por 20€ ganado.'); db.clics[uid] = 0; return; }
    try { await ctx.editMessageText(`💉 TINTA: ${db.clics[uid]} / 1000 ml`, Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR', 'minar')], [Markup.button.callback('⬅️ SALIR', 'volver')]])); } catch(e){}
    return ctx.answerCbQuery();
});
mineScene.action('volver', (ctx) => { ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

// --- IA CREATOR (Con Modos) ---
const iaWizard = new Scenes.WizardScene('ia-wizard',
    (ctx) => {
        ctx.reply('🎨 **ESTILO DE TATUAJE**', Markup.keyboard([['⚡ Flash', '🚬 Chicano'], ['✨ Blackwork', '🎨 Realismo'], ['⬅️ VOLVER']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === '⬅️ VOLVER') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.modo = ctx.message.text;
        ctx.reply('🤖 Describe tu idea (ej: Una catrina con rosas):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        db.stats.prompts++;
        const prompt = `Professional tattoo, style: ${ctx.wizard.state.modo}, ${traducirTerminos(ctx.message.text)}, white background, high contrast, 8k.`;
        await ctx.reply(`🧠 **PROMPT:**\n<code>${prompt}</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('🎨 GENERAR', `https://gemini.google.com/app?q=${encodeURIComponent(prompt)}`)]]) });
        return ctx.scene.leave();
    }
);

// --- CITA WIZARD ---
const tattooWizard = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('✍️ Nombre:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.n = ctx.message.text; ctx.reply('🔞 Edad:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.e = ctx.message.text; ctx.reply('📍 Zona y Tamaño:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.z = ctx.message.text; ctx.reply('📲 WhatsApp:'); return ctx.wizard.next(); },
    async (ctx) => {
        db.stats.citas++;
        const d = ctx.wizard.state.f; d.w = ctx.message.text; guardar();
        await bot.telegram.sendMessage(MI_ID, `🆕 **CITA:** ${d.n}\n📞 ${d.w}\n🆔 \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
        await ctx.reply('✅ Registrada. Te escribiremos pronto.');
        return ctx.scene.leave();
    }
);

// ==========================================
// 6. MENÚS Y SUBMENÚS (UI ELITE)
// ==========================================
function irAlMenuPrincipal(ctx) {
    if (!db.usuarios.includes(ctx.from.id)) { db.usuarios.push(ctx.from.id); guardar(); }
    return ctx.reply('✨ **S P I C Y  I N K** ✨\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 AGENDAR CITA', '🤖 IA CREATOR'],
            ['💎 CLUB & STATUS', '🎁 PROMOS'],
            ['⚙️ MÁS OPCIONES']
        ]).resize()
    );
}

bot.hears('⚙️ MÁS OPCIONES', (ctx) => {
    ctx.reply('🛠 **SUBMENÚ ADICIONAL**', 
        Markup.keyboard([
            ['👥 REFERIDOS', '💉 MINAR TINTA'],
            ['📚 ENCICLOPEDIA', '🧼 CUIDADOS'],
            ['⭐ RESEÑAS', '⬅️ VOLVER']
        ]).resize());
});

bot.hears('💎 CLUB & STATUS', (ctx) => {
    const pts = db.puntos[ctx.from.id] || 0;
    const r = obtenerRango(pts);
    ctx.reply(`${r.c} **RANGO: ${r.n}**\n✨ Puntos: ${pts}\n💰 Beneficio: ${r.d} DTO.\n\n_Suma puntos tatuándote o con referidos._`);
});

bot.hears('📚 ENCICLOPEDIA', (ctx) => {
    ctx.reply('📚 **GUÍA DE ESTILOS**', Markup.inlineKeyboard([
        [Markup.button.callback('🚬 Chicano', 'info_chi'), Markup.button.callback('🐍 Blackwork', 'info_bw')],
        [Markup.button.callback('🌸 Fine Line', 'info_fl'), Markup.button.callback('🎨 Realismo', 'info_re')]
    ]));
});

// ==========================================
// 7. COMANDOS ADMIN
// ==========================================
bot.command('puntos', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    const [_, uid, cant] = ctx.message.text.split(' ');
    db.puntos[uid] = (db.puntos[uid] || 0) + parseInt(cant); guardar();
    ctx.reply(`✅ ${cant} pts sumados a ${uid}.`);
});

bot.command('stats', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    ctx.reply(`📊 **STATS:**\nCitas: ${db.stats.citas}\nPrompts: ${db.stats.prompts}\nUsuarios: ${db.usuarios.length}`);
});

// ==========================================
// 8. LANZAMIENTO
// ==========================================
const stage = new Scenes.Stage([tattooWizard, iaWizard, mineScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const text = ctx.message.text;
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != ctx.from.id && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1; guardar();
        }
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🔥 AGENDAR CITA', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🤖 IA CREATOR', (ctx) => ctx.scene.enter('ia-wizard'));
bot.hears('💉 MINAR TINTA', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('⬅️ VOLVER', (ctx) => irAlMenuPrincipal(ctx));
bot.hears('🎁 PROMOS', (ctx) => ctx.reply('🚀 CANAL: https://t.me/+rnjk7xiUjFhlMzdk'));

bot.launch();
