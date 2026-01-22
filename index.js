require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// Auxiliar para links de usuario en notificaciones admin
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

// ==========================================
// 3. LÓGICA DE PRESUPUESTO (ALGORITMO)
// ==========================================
function calcularPresupuesto(tamanoStr, zona) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    let estimado = "";

    if (cms <= 5) {
        estimado = "30€ (Tarifa Mini)";
    } else if (cms <= 10) {
        estimado = "65€ - 100€ (Mediano)";
    } else if (cms <= 15) {
        estimado = "100€ - 200€ (Grande)";
    } else {
        return "A valorar por el tatuador (Pieza XL)";
    }

    const zonasDificiles = ['Costillas', 'Cuello', 'Mano', 'Rodilla', 'Esternón', 'Cara', 'Pies'];
    if (zonasDificiles.some(z => zona.toLowerCase().includes(z.toLowerCase()))) {
        return `Estimado base: ${estimado} (Sujeto a incremento por zona de alta dificultad)`;
    }

    return `Estimado: ${estimado}`;
}

// ==========================================
// 4. MENÚ PRINCIPAL
// ==========================================
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
// 5. DEFINICIÓN DE ESCENAS (SCENES)
// ==========================================

// --- ESCENA MINERÍA ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    const clics = db.clics[uid] || 0;
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\n\nEstado: ${clics} / 1000 ml\nPremio: TATTOO MINI 20€\n\nPulsa para recolectar:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')],
            [Markup.button.callback('⬅️ SALIR', 'volver_menu')]
        ])
    );
});

mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.editMessageText('🎉 TANQUE COMPLETADO 🎉\nHaz captura y envíala al tatuador.');
        db.clics[uid] = 0; guardar(); return;
    }
    try {
        await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\n\nEstado: ${db.clics[uid]} / 1000 ml`,
            Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]));
    } catch (e) {}
    return ctx.answerCbQuery();
});

mineScene.action('volver_menu', async (ctx) => {
    await ctx.scene.leave();
    return irAlMenuPrincipal(ctx);
});

// --- ESCENA FORMULARIO PROFESIONAL ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { 
        ctx.reply('⚠️ A V I S O  I M P O R T A N T E\n━━━━━━━━━━━━━━━━━━━━\nDebes proporcionar DATOS REALES. Cualquier error puede invalidar el presupuesto.\n\nEscribe tu Nombre Completo:'); 
        ctx.wizard.state.f = {}; return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 ¿Zona del cuerpo? (Sé específico):', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('📏 Tamaño exacto en cm:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.tamano = ctx.message.text; ctx.reply('🎨 Estilo (Fine Line, Blackwork...):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('🏥 Alergias o medicación:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('🖼️ Envía FOTO de referencia (Obligatorio):'); return ctx.wizard.next(); },
    (ctx) => {
        if (!ctx.message.photo) return ctx.reply('⚠️ Envía una imagen.');
        ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply('📲 Tu WhatsApp (sin espacios):'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text.replace(/\s+/g, '');
        const estimacion = calcularPresupuesto(d.tamano, d.zona);
        
        await ctx.reply(`✅ SOLICITUD PROCESADA\n━━━━━━━━━━━━━━━━━━━━\n🤖 ESTIMACIÓN AUTOMÁTICA:\n${estimacion}\n\n📢 NOTA: Soy un robot en fase de testeo. El precio real lo estipula el tatuador al contactarte.`);
        
        const fichaAdmin = `🖋️ NUEVA CITA\n👤 ${d.nombre}\n📍 ${d.zona}\n📏 ${d.tamano}\n🎨 ${d.estilo}\n💰 ${estimacion}\n📞 WA: ${d.telefono}`;
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, Markup.inlineKeyboard([[Markup.button.url('📲 WHATSAPP', `https://wa.me/${d.telefono}`)]]));
        await ctx.telegram.sendPhoto(MI_ID, d.foto);
        return ctx.scene.leave();
    }
);

// --- ESCENA IDEAS ---
const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 A S E S O R Í A\n━━━━━━━━━━━━━━━━━━━━\nSelecciona zona:', Markup.keyboard([['Antebrazo', 'Costillas'], ['Cuello', 'Mano'], ['⬅️ Volver']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text.includes('Volver')) return ctx.scene.leave();
        ctx.reply(`Has elegido ${ctx.message.text}. Es una zona excelente para diseños sólidos.`);
        return ctx.scene.leave();
    }
);

// ==========================================
// 6. LÓGICA DE REFERIDOS Y START
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    if (payload && payload !== String(ctx.from.id) && !db.invitados[ctx.from.id]) {
        db.invitados[ctx.from.id] = parseInt(payload);
        db.referidos[payload] = (db.referidos[payload] || 0) + 1;
        guardar();
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const total = db.referidos[uid] || 0;
    const confirmados = db.confirmados[uid] || 0;
    
    ctx.reply(`👥 S O C I O S\n━━━━━━━━━━━━━━━━━━━━\n\n🔗 Link:\nhttps://t.me/SpicyInkBot?start=${uid}\n\n📊 Stats: ${confirmados} / 3 confirmados.\n\n📜 PREMIOS:\n<code>Si 3 personas se tatuán con tu link:\n✅ 100% DTO en Tattoo Pequeño\n✅ 50% DTO en Tattoo Grande</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    });
});

bot.action('reportar_tatuaje', async (ctx) => {
    const sponsorId = db.invitados[ctx.from.id];
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No tienes sponsor.');
    await ctx.reply('✅ Reporte enviado al tatuador.');
    await ctx.telegram.sendMessage(MI_ID, `🔔 VALIDACIÓN\nUsuario: ${getUserLink(ctx)} se ha tatuado.\nSponsor: ${sponsorId}`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ ACEPTAR', `v_si_${ctx.from.id}_${sponsorId}`)]])
    });
});

bot.action(/^v_si_(\d+)_(\d+)$/, async (ctx) => {
    const sid = ctx.match[2];
    db.confirmados[sid] = (db.confirmados[sid] || 0) + 1;
    guardar();
    await ctx.editMessageText('✅ Validado.');
    await ctx.telegram.sendMessage(sid, `🔥 ¡Referido confirmado! (${db.confirmados[sid]}/3)`);
});

// ==========================================
// 7. LISTENERS GLOBALES
// ==========================================
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('🧼 CUIDADOS:\n1. Jabón neutro.\n2. Crema cicatrizante.\n3. No sol ni piscina.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎁 PRÓXIMO SORTEO: 05 de Febrero. ¡Atento al canal!'));

bot.launch().then(() => console.log('🚀 Tatuador Online con Lógica de Presupuesto'));
