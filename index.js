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
// 3. LÓGICA DE PRESUPUESTO DINÁMICA
// ==========================================
function calcularPresupuesto(tamanoStr, zona, estilo) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    const zonaLow = zona.toLowerCase();
    const estiloLow = (estilo || "").toLowerCase();
    let estimado = "";

    // Escala base (13cm = ~90€)
    if (cms <= 5) {
        estimado = "30€ (Tarifa Mini)";
    } else if (cms <= 10) {
        estimado = "65€ - 85€ (Mediano)";
    } else if (cms <= 14) {
        estimado = "90€ - 110€ (Grande)";
    } else if (cms <= 20) {
        estimado = "120€ - 200€ (Maxi)";
    } else {
        return "A valorar por el tatuador (Pieza XL / Sesión)";
    }

    let pluses = [];
    // Plus por Estilo (Realismo y Lettering complejo)
    if (estiloLow.includes("realismo")) {
        pluses.push("Complejidad de Estilo (Realismo)");
    } else if (estiloLow.includes("lettering")) {
        pluses.push("Detalle de Caligrafía (Lettering)");
    }

    // Plus por Zonas Técnicas
    const zonasCriticas = ['costillas', 'cuello', 'mano', 'rodilla', 'esternon', 'cara', 'pies', 'columna', 'codo', 'tobillo', 'axila'];
    if (zonasCriticas.some(z => zonaLow.includes(z))) {
        pluses.push("Dificultad de Zona Anatómica");
    }

    if (pluses.length > 0) {
        return `Estimado base: ${estimado}\n⚠️ INCREMENTO POR:\n└ ${pluses.join("\n└ ")}`;
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
// 5. ESCENAS
// ==========================================

// --- ESCENA MINERÍA ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid] || 0} / 1000 ml`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]));
});
mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.editMessageText('🎉 TANQUE COMPLETADO 🎉\nHaz captura para canjear.');
        db.clics[uid] = 0; guardar(); return;
    }
    try { await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid]} / 1000 ml`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]])); } catch (e) {}
    return ctx.answerCbQuery();
});
mineScene.action('volver_menu', async (ctx) => { await ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

// --- ESCENA FORMULARIO (ACTUALIZADA CON LETTERING) ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { 
        ctx.reply('⚠️ A V I S O  I M P O R T A N T E\n━━━━━━━━━━━━━━━━━━━━\nDebes proporcionar DATOS REALES.\n\nEscribe tu Nombre Completo:'); 
        ctx.wizard.state.f = {}; return ctx.wizard.next(); 
    },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 ¿Zona del cuerpo? (Ej: Antebrazo, Cuello...):', Markup.removeKeyboard()); return ctx.wizard.next();
    },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('📏 Tamaño exacto en cm:'); return ctx.wizard.next(); },
    (ctx) => { 
        ctx.wizard.state.f.tamano = ctx.message.text; 
        ctx.reply('🎨 Selecciona el Estilo del tatuaje:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Fine Line', 'estilo_Fine Line'), Markup.button.callback('Realismo', 'estilo_Realismo')],
                [Markup.button.callback('Lettering', 'estilo_Lettering'), Markup.button.callback('Blackwork', 'estilo_Blackwork')],
                [Markup.button.callback('Tradicional', 'estilo_Tradicional'), Markup.button.callback('Minimalista', 'estilo_Minimalista')],
                [Markup.button.callback('Full Color', 'estilo_Full Color'), Markup.button.callback('Otro', 'estilo_Otro')]
            ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery) {
            ctx.wizard.state.f.estilo = ctx.callbackQuery.data.replace('estilo_', '');
            ctx.answerCbQuery();
            ctx.reply('🏥 Alergias o medicación actual:');
            return ctx.wizard.next();
        }
        return ctx.reply('⚠️ Por favor, usa los botones para seleccionar un estilo.');
    },
    (ctx) => { ctx.wizard.state.f.salud = ctx.message.text; ctx.reply('🖼️ Envía FOTO de referencia (Obligatorio):'); return ctx.wizard.next(); },
    (ctx) => {
        if (!ctx.message.photo) return ctx.reply('⚠️ Por favor, envía una imagen de referencia.');
        ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply('📲 Tu número de WhatsApp:'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text.replace(/\s+/g, '');
        const estimacion = calcularPresupuesto(d.tamano, d.zona, d.estilo);
        
        await ctx.reply(`✅ SOLICITUD ENVIADA\n━━━━━━━━━━━━━━━━━━━━\n🤖 **ESTIMACIÓN AUTOMÁTICA:**\n> ${estimacion}\n\n📢 **NOTA DE TESTEO:**\nEste presupuesto es orientativo. El tatuador confirmará el precio final según el detalle.`);
        
        const fichaAdmin = `🖋️ NUEVA CITA\n👤 ${d.nombre}\n📍 ${d.zona}\n📏 ${d.tamano}\n🎨 ${d.estilo}\n💰 ${estimacion.replace(/\n/g, ' ')}\n📞 WA: ${d.telefono}`;
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, Markup.inlineKeyboard([[Markup.button.url('📲 CONTACTAR', `https://wa.me/${d.telefono}`)]]));
        await ctx.telegram.sendPhoto(MI_ID, d.foto);
        return ctx.scene.leave();
    }
);

// --- ESCENA IDEAS (AMPLIADA) ---
const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 A S E S O R Í A  D E  Z O N A S\n━━━━━━━━━━━━━━━━━━━━\nSelecciona una zona:', 
            Markup.keyboard([
                ['Antebrazo', 'Bíceps', 'Hombro'],
                ['Costillas', 'Esternón', 'Espalda'],
                ['Muslo', 'Gemelo', 'Tobillo'],
                ['Mano', 'Cuello', 'Muñeca'],
                ['⬅️ Volver al Menú']
            ]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg.includes('Volver')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        const consejos = {
            'Antebrazo': "💪 Zona ideal para primer tatuaje y lettering legible.",
            'Costillas': "⚖️ Zona elegante pero sensible. Requiere paciencia.",
            'Cuello': "🔥 Estética potente. El diseño debe fluir con el movimiento.",
            'Mano': "🤚 Zona de mucho desgaste. Requiere líneas muy sólidas.",
            'Bíceps': "🛡️ Perfecto para piezas con volumen y sombreados.",
            'Espalda': "🦅 El mejor lienzo para piezas de gran tamaño.",
            'Esternón': "💀 Sensibilidad alta. Los diseños simétricos quedan increíbles.",
            'Muslo': "🦵 Ideal para realismo y piezas muy detalladas.",
            'Gemelo': "⚡ Muy agradecido para sombreados y estilo tradicional.",
            'Muñeca': "✨ Perfecto para detalles finos y minimalismo.",
            'Tobillo': "⚓ Zona discreta y fina."
        };
        ctx.reply(consejos[msg] || "✨ Selecciona una opción del menú.");
        ctx.scene.leave(); return irAlMenuPrincipal(ctx);
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

bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`👥 S O C I O S\n━━━━━━━━━━━━━━━━━━━━\n🔗 Enlace: https://t.me/SpicyInkBot?start=${uid}\n📊 Confirmados: ${db.confirmados[uid] || 0} / 3`,
        Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]]));
});

bot.action('reportar_tatuaje', async (ctx) => {
    const sponsorId = db.invitados[ctx.from.id];
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No tienes sponsor.');
    await ctx.reply('✅ Reporte enviado al tatuador.');
    await ctx.telegram.sendMessage(MI_ID, `🔔 VALIDACIÓN\nUser: ${getUserLink(ctx)}\nSponsor: ${sponsorId}`, {
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

bot.hears('🧼 Cuidados', (ctx) => ctx.reply('🧼 CUIDADOS:\nJabón neutro, crema específica y evitar sol/piscina durante 15 días.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎁 Consulta el canal principal para participar en el sorteo actual.'));

bot.launch().then(() => console.log('🚀 Tatuador Online con Lettering'));



