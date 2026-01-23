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
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {}, fichas: {} };
const DATA_FILE = './database.json';

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.fichas) db.fichas = {};
    } catch (e) { console.log("Error al cargar DB, usando valores por defecto."); }
}

function guardar() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
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
    if (pluses.length > 0) {
        base += `\n⚠️ FACTORES DE AJUSTE:\n└ ${pluses.join("\n└ ")}`;
    }
    
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
            await ctx.reply('🔍 Analizando composición...');
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
        const fichaAdmin = `🖋️ CITA\n👤 ${d.nombre}\n📍 ${d.zona}\n📏 ${d.tamano}\n🎨 ${d.estilo}\n💰 Estimado: ${estimacion.split('\n')[0]}\n📞 WA: ${d.telefono}`;
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, Markup.inlineKeyboard([[Markup.button.url('📲 CONTACTAR', `https://wa.me/${d.telefono}`)]]));
        if (d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto);
        return ctx.scene.leave();
    }
);

// --- NUEVA ESCENA DE IA PERSONALIZADA ---
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
        const f = db.fichas[ctx.from.id];

        // Construcción del Prompt
        const prompt = `Tattoo design of ${ai.elemento} with ${ai.detalle}, ${ai.color}, high contrast, professional tattoo flash style, white background, detailed linework, optimized for ${f.zona} area.`;
        
        // Codificar para URL
        const encodedPrompt = encodeURIComponent(prompt);
        const geminiUrl = `https://gemini.google.com/app?q=Genera%20una%20imagen%20de%20tatuaje%20con%20este%20prompt%20en%20inglés:%20${encodedPrompt}`;

        await ctx.reply(`🧠 **PROMPT GENERADO**\n━━━━━━━━━━━━━━━━━━━━\nHe diseñado el comando perfecto para que la IA de Google cree tu imagen:\n\n<code>${prompt}</code>\n\n👇 **PULSA EL BOTÓN PARA GENERAR LA IMAGEN**`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('🎨 GENERAR EN GOOGLE GEMINI', geminiUrl)],
                [Markup.button.callback('🔄 Crear otra idea', 'nueva_ia')]
            ])
        });
        return ctx.scene.leave();
    }
);

const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 A S E S O R Í A  D E  Z O N A S\n━━━━━━━━━━━━━━━━━━━━\nSelecciona una zona para ver consejos técnicos:', 
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
            'Antebrazo': "💪 Zona ideal para primer tatuaje. Envejece muy bien y luce genial con Lettering.",
            'Costillas': "⚖️ Zona elegante pero de sensibilidad alta. Se recomiendan diseños de línea fina.",
            'Cuello': "🔥 Estética potente. El diseño debe adaptarse al movimiento natural del cuerpo.",
            'Mano': "🤚 Desgaste alto por regeneración de piel. Requiere líneas sólidas.",
            'Bíceps': "🛡️ Mucho lienzo para realismo o piezas con gran volumen y sombras.",
            'Espalda': "🦅 El lienzo más grande. Permite composiciones complejas y piezas XL.",
            'Esternón': "💀 Sensibilidad alta. Los diseños simétricos lucen increíbles aquí.",
            'Muslo': "🦵 Excelente para piezas grandes y uso de color.",
            'Gemelo': "⚡ Muy agradecido para sombras y estilo tradicional.",
            'Muñeca': "✨ Ideal para detalles minimalistas.",
            'Tobillo': "⚓ Zona discreta y fina. Cuidado con el roce del calzado al curar.",
            'Hombro': "🔱 Clásico que mantiene muy bien la forma con los años."
        };
        ctx.reply(consejos[msg] || "✨ Selecciona una zona del menú.");
        ctx.scene.leave(); 
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 6. LÓGICA DE REFERIDOS Y START
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene, iaScene]);
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
    const confirmados = db.confirmados[uid] || 0;
    ctx.reply(`👥 S I S T E M A  D E  S O C I O S\n━━━━━━━━━━━━━━━━━━━━\n🔗 Tu enlace:\nhttps://t.me/SpicyInkBot?start=${uid}\n\n📊 Confirmados: ${confirmados} / 3\n\n<code>RECOMPENSAS EXCLUSIVAS:\nSi 3 personas se tatúan con tu enlace:\n✅ 100% DTO en Tattoos Pequeños\n✅ 100% DTO en Tattoos Medianos\n✅ 50% DTO en Tattoos Grandes</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'reportar_tatuaje')]])
    });
});

bot.action('reportar_tatuaje', async (ctx) => {
    const sponsorId = db.invitados[ctx.from.id];
    if (!sponsorId) return ctx.answerCbQuery('⚠️ No tienes sponsor registrado.');
    await ctx.reply('✅ Reporte enviado para validación.');
    await ctx.telegram.sendMessage(MI_ID, `🔔 VALIDACIÓN DE TATUAJE\nUsuario: ${getUserLink(ctx)}\nSponsor ID: ${sponsorId}`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('✅ ACEPTAR Y SUMAR PUNTO', `v_si_${ctx.from.id}_${sponsorId}`)]])
    });
});

bot.action(/^v_si_(\d+)_(\d+)$/, async (ctx) => {
    const sid = ctx.match[2];
    db.confirmados[sid] = (db.confirmados[sid] || 0) + 1;
    guardar();
    await ctx.editMessageText('✅ Validado. Punto sumado al sponsor.');
    await ctx.telegram.sendMessage(sid, `🔥 ¡Enhorabuena! Un amigo se ha tatuado. Ya tienes (${db.confirmados[sid]}/3) confirmados.`);
});

// ==========================================
// 7. LISTENERS GLOBALES E IA
// ==========================================

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => {
    if (!db.fichas[ctx.from.id]) {
        return ctx.reply('🤖 **BLOQUEO DE IA**\n━━━━━━━━━━━━━━━━━━━━\nPara generar ideas personalizadas necesito conocer tu estilo y zona preferida.\n\n¿Has enviado ya tu ficha de presupuesto?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ SÍ, enviarla ahora', 'ir_a_formulario')],
                [Markup.button.callback('❌ NO, volver', 'volver_ia')]
            ])
        );
    }
    return ctx.scene.enter('ia-wizard');
});

bot.action('nueva_ia', (ctx) => {
    ctx.answerCbQuery();
    return ctx.scene.enter('ia-wizard');
});

bot.action('ir_a_formulario', (ctx) => {
    ctx.answerCbQuery();
    return ctx.scene.enter('tattoo-wizard');
});

bot.action('volver_ia', (ctx) => {
    ctx.answerCbQuery();
    return ctx.editMessageText('Entendido. Vuelve cuando quieras probar la IA.');
});

bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('🧼 CUIDADOS:\nJabón neutro y crema 3 veces al día. No sol ni playa.'));
bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🎁 S O R T E O  A C T I V O\n━━━━━━━━━━━━━━━━━━━━\n📅 Fecha: 05 al 10 de Febrero de 2026\n💰 Premio: TATTOO VALORADO EN 150€\n\n👇 Participa aquí:\nhttps://t.me/+bAbJXSaI4rE0YzM0', { disable_web_page_preview: true });
});

bot.launch().then(() => console.log('🚀 Tatuador Online Actualizado 2026'));
