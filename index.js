require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
// 2. BASE DE DATOS LOCAL (PARA RENDER)
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {}, fichas: {} };
const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.fichas) db.fichas = {};
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. LÓGICA DE PRESUPUESTO DINÁMICA
// ==========================================
function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    const zonaLow = zona.toLowerCase();
    const estiloLow = (estilo || "").toLowerCase();
    let estimado = "";

    if (cms <= 5) estimado = "30€ (Tarifa Mini)";
    else if (cms <= 10) estimado = "65€ - 85€ (Mediano)";
    else if (cms <= 14) estimado = "90€ - 110€ (Grande)";
    else if (cms <= 20) estimado = "120€ - 200€ (Maxi)";
    else return "A valorar por el tatuador (Pieza XL / Sesión)";

    let pluses = [];
    if (estiloLow.includes("realismo")) pluses.push("Complejidad de Estilo (Realismo)");
    else if (estiloLow.includes("lettering")) pluses.push("Detalle de Caligrafía (Lettering)");

    const zonasCriticas = ['costillas', 'cuello', 'mano', 'rodilla', 'esternon', 'cara', 'pies', 'columna', 'codo', 'tobillo', 'axila'];
    if (zonasCriticas.some(z => zonaLow.includes(z))) pluses.push("Dificultad de Zona Anatómica");

    if (tieneFoto) pluses.push("Carga de detalle analizada en referencia 🖼️");
    else pluses.push("Sin referencia visual (Sujeto a cambios)");

    let base = `Estimado base: ${estimado}`;
    if (pluses.length > 0) base += `\n⚠️ FACTORES DE AJUSTE:\n└ ${pluses.join("\n└ ")}`;
    
    base += `\n\n📢 **AVISO:** Este presupuesto ha sido generado automáticamente por un robot con fines puramente orientativos. El precio real y definitivo será estipulado únicamente por el tatuador tras revisar personalmente el diseño final.`;
    
    return base;
}

// ==========================================
// 4. MENÚ PRINCIPAL
// ==========================================
function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\nGestión de citas y eventos exclusivos.\n\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '🤖 IA: ¿Qué me tatuo?'],
            ['👥 Mis Referidos', '🧼 Cuidados'],
            ['🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 5. ESCENAS
// ==========================================

const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid] || 0} / 1000 ml\n🎁 PREMIO: TATTOO 20€\n\nPulsa para recolectar:`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]));
});
mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.editMessageText('🎉 TANQUE COMPLETADO 🎉\nHas ganado tu tatuaje por 20€. Haz captura para canjear.');
        db.clics[uid] = 0; guardar(); return;
    }
    try { await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid]} / 1000 ml\n🎁 PREMIO: TATTOO 20€`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]])); } catch (e) {}
    return ctx.answerCbQuery();
});
mineScene.action('volver_menu', async (ctx) => { await ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('⚠️ FORMULARIO DE CITA\n━━━━━━━━━━━━━━━━━━━━\nEscribe tu Nombre Completo:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 Selecciona la zona del cuerpo:', 
            Markup.keyboard([
                ['Antebrazo', 'Bíceps', 'Hombro'],
                ['Costillas', 'Esternón', 'Espalda'],
                ['Muslo', 'Gemelo', 'Tobillo'],
                ['Mano', 'Cuello', 'Muñeca'],
                ['Otro']
            ]).oneTime().resize()); 
        return ctx.wizard.next();
    },
    (ctx) => { 
        ctx.wizard.state.f.zona = ctx.message.text; 
        ctx.reply('📏 Tamaño aproximado en cm:', Markup.removeKeyboard()); 
        return ctx.wizard.next(); 
    },
    (ctx) => { 
        ctx.wizard.state.f.tamano = ctx.message.text; 
        ctx.reply('🎨 Selecciona el Estilo:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Fine Line', 'estilo_Fine Line'), Markup.button.callback('Realismo', 'estilo_Realismo')],
                [Markup.button.callback('Lettering', 'estilo_Lettering'), Markup.button.callback('Blackwork', 'estilo_Blackwork')],
                [Markup.button.callback('Otro', 'estilo_Otro')]
            ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery) {
            ctx.wizard.state.f.estilo = ctx.callbackQuery.data.replace('estilo_', '');
            ctx.answerCbQuery();
            ctx.reply('🏥 Alergias o medicación:');
            return ctx.wizard.next();
        }
        return ctx.reply('⚠️ Usa los botones.');
    },
    (ctx) => { 
        ctx.wizard.state.f.salud = ctx.message.text; 
        ctx.reply('🖼️ REFERENCIA VISUAL (Recomendado)\n━━━━━━━━━━━━━━━━━━━━\nEnvía una foto de tu diseño o pulsa el botón:', 
            Markup.inlineKeyboard([[Markup.button.callback('❌ No tengo diseño', 'no_foto')]]));
        return ctx.wizard.next(); 
    },
    async (ctx) => {
        if (ctx.message && ctx.message.photo) {
            ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            ctx.wizard.state.f.tieneFoto = true;
        } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'no_foto') {
            ctx.wizard.state.f.tieneFoto = false;
            ctx.answerCbQuery();
        } else return ctx.reply('⚠️ Envía una foto o pulsa el botón.');
        ctx.reply('📲 WhatsApp:'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text.replace(/\s+/g, '');
        db.fichas[ctx.from.id] = d;
        guardar();
        const estimacion = calcularPresupuesto(d.tamano, d.zona, d.estilo, d.tieneFoto);
        await ctx.reply(`✅ SOLICITUD ENVIADA\n━━━━━━━━━━━━━━━━━━━━\n${estimacion}`);
        return ctx.scene.leave();
    }
);

// ==========================================
// ESCENA DE IA: CUESTIONARIO Y PROMPT
// ==========================================
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => {
        ctx.reply('🤖 **DISEÑADOR VIRTUAL**\n━━━━━━━━━━━━━━━━━━━━\n¿Qué elemento principal quieres en tu tatuaje? (Ej: Un lobo, una rosa, una brújula...)');
        ctx.wizard.state.ai = {};
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.elemento = ctx.message.text;
        ctx.reply('🌗 ¿Lo quieres en Blanco y Negro o a Color?', 
            Markup.keyboard([['Blanco y Negro', 'Color']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.color = ctx.message.text;
        ctx.reply('✨ Describe un detalle especial (Ej: Que tenga flores, efecto humo, estilo roto...):');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        ai.detalle = ctx.message.text;
        
        // Obtenemos los datos de la ficha previa del usuario
        const f = db.fichas[ctx.from.id] || { zona: "cuerpo", estilo: "artístico" };

        const prompt = `Tattoo design of ${ai.elemento} with ${ai.detalle}, ${ai.color}, high contrast, professional tattoo flash style, white background, detailed linework, optimized for ${f.zona} area, in ${f.estilo} style.`;
        
        const encodedPrompt = encodeURIComponent(`Genera una imagen de tatuaje con este prompt en inglés: ${prompt}`);
        const geminiUrl = `https://gemini.google.com/app?q=${encodedPrompt}`;

        await ctx.reply(`🧠 **DISEÑO IA GENERADO**\n━━━━━━━━━━━━━━━━━━━━\nHe analizado tu estilo y zona favorita para crear el comando perfecto:\n\n<code>${prompt}</code>\n\n👇 **PULSA ABAJO PARA GENERAR LA IMAGEN**`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🎨 GENERAR EN GOOGLE GEMINI', geminiUrl)],
                [Markup.button.callback('🔄 Otra idea', 'nueva_ia')]
            ])
        });
        return ctx.scene.leave();
    }
);

const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 Selecciona una zona:', Markup.keyboard([['Antebrazo', 'Bíceps'], ['Costillas', 'Espalda'], ['⬅️ Volver']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg.includes('Volver')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.reply("💡 Consejo: " + msg + " es una zona excelente para este tipo de diseños.");
        ctx.scene.leave(); return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 6. MIDDLEWARES Y REGISTRO
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene, iaScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => {
    if (!db.fichas[ctx.from.id]) {
        return ctx.reply('🤖 **BLOQUEO DE IA**\nNecesito conocer tu estilo primero.\n\n¿Has enviado ya tu ficha?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Sí, enviarla ahora', 'ir_a_formulario')],
                [Markup.button.callback('❌ No, volver', 'volver_ia')]
            ])
        );
    }
    return ctx.scene.enter('ia-wizard');
});

bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });
bot.action('ir_a_formulario', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('tattoo-wizard'); });
bot.action('volver_ia', (ctx) => { ctx.answerCbQuery(); return ctx.editMessageText('Vuelve cuando quieras.'); });

bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Jabón neutro y crema 3 veces al día.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎁 SORTEO ACTIVO: https://t.me/+bAbJXSaI4rE0YzM0'));

bot.launch().then(() => console.log('🚀 Bot Funcionando con IA Dinámica'));
