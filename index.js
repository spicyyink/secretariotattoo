require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Pro Engine ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

let CLAVES_DISPONIBLES = ['s7p', 'k82', 'x9w', 'n4m', 'v2t', 'b5z'];
const usuariosAutorizados = new Map(); 
let stats = { visitas: 0, fichas: 0 };

// ==========================================
// ESCENA: VALORACIÓN TESTER (Encuesta detallada)
// ==========================================
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('📊 VALORACIÓN DEL SISTEMA\n\n1. ¿Has detectado fallos técnicos o errores en los textos?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.fallos = ctx.message.text;
        ctx.reply('2. ¿Qué te ha parecido la experiencia de usuario y la fluidez del bot?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.opinion = ctx.message.text;
        ctx.reply('3. ¿Qué cambios harías para que el bot sea aún más profesional?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('4. Valora el bot del 1 al 10:', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const d = ctx.wizard.state;
        const inicio = usuariosAutorizados.get(ctx.from.id);
        const tiempo = inicio ? Math.round((Date.now() - inicio) / 1000 / 60) : 0; 

        const reporte = `🌟 FEEDBACK TESTER\n\nUsuario: @${ctx.from.username}\nTiempo de testeo: ${tiempo} min\n\nFallos: ${d.fallos}\nOpinión: ${d.opinion}\nPropuestas: ${d.mejoras}\nNota final: ${nota}/10`;
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply('✅ Valoración enviada. Gracias por ayudarnos a perfeccionar SpicyBot.');
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// ESCENA: CONSULTORÍA SPICYBOT (10 PREGUNTAS)
// ==========================================
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('👋 Bienvenido a la consultoría técnica.\n\n1. ¿Cuál es tu nombre completo?');
        ctx.wizard.state.form = { user: ctx.from.username || 'n/a' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.nombre = ctx.message.text;
        ctx.reply('2. ¿Qué edad tienes?', Markup.keyboard([['+18 años', 'Entre 16 y 18'], ['Menos de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === 'Menos de 16') {
            ctx.reply('Lo sentimos, el estudio no realiza trabajos a menores de 16 años.');
            return ctx.scene.leave();
        }
        ctx.wizard.state.form.edad = ctx.message.text;
        ctx.reply('3. ¿Qué estilo de tatuaje buscas?', Markup.keyboard([['Realismo', 'Fine Line', 'Blackwork'], ['Tradicional', 'Microrealismo', 'Otro']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.estilo = ctx.message.text;
        ctx.reply('4. ¿En qué zona del cuerpo quieres tatuarte?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.zona = ctx.message.text;
        ctx.reply('5. ¿Tienes cicatrices, lunares o marcas en esa zona?', Markup.keyboard([['Piel limpia', 'Tengo marcas/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.piel = ctx.message.text;
        ctx.reply('6. ¿Qué tamaño aproximado buscas (en cm)?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.tamano = ctx.message.text;
        ctx.reply('7. ¿Es tu primer tatuaje?', Markup.keyboard([['Sí', 'No']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.primero = ctx.message.text;
        ctx.reply('8. ¿Tienes alergias, diabetes o alguna condición de salud?', Markup.keyboard([['Todo bien', 'Sí (especificar)']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.salud = ctx.message.text;
        ctx.reply('9. Indica tu WhatsApp para recibir el presupuesto:');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.form.whatsapp = ctx.message.text;
        ctx.reply('10. Por último, envíame una foto de referencia o de la zona:', Markup.keyboard([['Sin foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        stats.fichas++;
        const f = ctx.wizard.state.form;

        const ficha = `🖋️ NUEVA CONSULTA\n\nNombre: ${f.nombre}\nEdad: ${f.edad}\nEstilo: ${f.estilo}\nZona: ${f.zona}\nMedidas: ${f.tamano}\nPiel: ${f.piel}\nPrimer tattoo: ${f.primero}\nSalud: ${f.salud}\nWA: ${f.whatsapp}`;
        
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);

        await ctx.reply('🚀 Ficha técnica enviada al tatuador. ¡Gracias por la información!');
        return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// MENÚ PRINCIPAL Y NAVEGACIÓN
// ==========================================

function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('💎 SPICY INKK - MENÚ PRINCIPAL\n\nSelecciona una opción para navegar por el sistema:', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Tatuador', '⭐ Valoración Tester']
        ]).resize());
}

bot.start((ctx) => {
    if (ctx.from.id.toString() === MI_ID || usuariosAutorizados.has(ctx.from.id)) {
        if (!usuariosAutorizados.has(ctx.from.id)) usuariosAutorizados.set(ctx.from.id, Date.now());
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO\nIntroduce tu clave de acceso de tester:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase().trim();
    if (userId.toString() === MI_ID || usuariosAutorizados.has(userId) || ctx.scene.current) return next();
    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); 
        return irAlMenuPrincipal(ctx);
    }
    return ctx.reply('❌ Clave incorrecta.');
});

const stage = new Scenes.Stage([tattooScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

// --- GESTIÓN DE BOTONES ---
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('⭐ Valoración Tester', (ctx) => ctx.scene.enter('feedback-scene'));

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('✨ GUÍA DE CUIDADOS PROFESIONAL\n\n1. Lavado: 3 veces al día con agua tibia y jabón neutro.\n2. Secado: Siempre con papel de cocina a toques suaves.\n3. Hidratación: Capa muy fina de crema (que brille, sin excesos).\n\nProductos recomendados:\n- Aquaphor (Eucerin)\n- Bepanthol Tatuajes\n\n🚫 Prohibido: Sol, piscina, playa y rascarse durante 15 días.');
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🔥 SORTEO ACTIVO: 05-10 FEBRERO 2026\n\nPara participar en el sorteo de un tatuaje valorado en 150€, entra en el siguiente link:',
    Markup.inlineKeyboard([[Markup.button.url('🔗 Acceder al Sorteo', 'https://t.me/+bAbJXSaI4rE0YzM0')]]));
});

bot.hears('💬 Tatuador', (ctx) => ctx.reply('Contacto directo: @SpicyInkk'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('Consulta las Stories de Instagram para ver disponibilidad inmediata.'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.reply('¿En qué zona tienes pensado tatuarte? Cuéntame tu idea y te asesoraré sobre el diseño.'));

bot.launch().then(() => console.log('✅ SpicyBot Pro Operativo'));
