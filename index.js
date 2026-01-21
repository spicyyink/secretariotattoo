require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Money Edition ✅');
});
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;
let stats = { visitas: 0, solicitudes: 0 };

// --- ESCENA DE PRESUPUESTO ENFOCADA A DINERO (Punto 8) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('💰 ¡Vamos a calcular tu presupuesto!\n\n¿Cómo te llamas?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('¿Qué quieres tatuarte? (Describe tu idea brevemente)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿En qué zona del cuerpo va?', Markup.keyboard([['Brazo', 'Pierna'], ['Espalda', 'Pecho'], ['Otro']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.zona = ctx.message.text;
        ctx.reply('📏 Tamaño aproximado en CENTÍMETROS (Ej: 15cm):');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('🎨 ¿A color o solo negros/sombras?', Markup.keyboard([['Blanco y Negro', 'Color']].oneTime().resize()));
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.estilo = ctx.message.text;
        ctx.reply('💸 ¿Cuál es tu presupuesto máximo para este tattoo?', 
            Markup.keyboard([['Menos de 100€', '100€ - 300€'], ['300€ - 600€', 'Más de 600€']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.pasta = ctx.message.text;
        ctx.reply('📱 Por último, tu WhatsApp para enviarte el diseño y la cita:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        const d = ctx.wizard.state.formData;
        stats.solicitudes++;

        await ctx.reply('✅ ¡Ficha enviada! Analizaré tu presupuesto y te escribo al WhatsApp en nada.');

        // NOTIFICACIÓN PARA TI (Con toda la info de dinero)
        const ficha = `💰 ¡NUEVO CLIENTE CON PASTA!\n\n` +
                      `👤 Nombre: ${d.nombre}\n` +
                      `💡 Idea: ${d.idea}\n` +
                      `📍 Zona: ${d.zona} (${d.tamano})\n` +
                      `🎨 Estilo: ${d.estilo}\n` +
                      `💸 PRESUPUESTO: ${d.pasta}\n` +
                      `📞 WhatsApp: ${d.telefono}`;

        await ctx.telegram.sendMessage(MI_ID, ficha, {
            ...Markup.inlineKeyboard([
                [Markup.button.url('💬 Contactar YA', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]
            ])
        });

        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('🖋️ SPICY INKK - GESTIÓN DE CITAS\n¿Qué quieres hacer?', 
        Markup.keyboard([
            ['💰 CALCULAR PRESUPUESTO'],
            ['🧼 Cuidados', '🚨 EMERGENCIA'],
            ['❓ FAQ', '📈 Mis Stats']
        ]).resize());
}

const stage = new Scenes.Stage([tattooScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));
bot.hears('💰 CALCULAR PRESUPUESTO', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Recuerda: Lavar 3 veces al día y crema específica. No sol, no piscina.'));
bot.hears('🚨 EMERGENCIA', (ctx) => ctx.reply('🆘 Si ves pus, fiebre o líneas rojas, acude a tu médico y avísame.'));
bot.hears('❓ FAQ', (ctx) => ctx.reply('Precio mínimo 60€. Citas con fianza previa. Solo mayores de edad.'));
bot.hears('📈 Mis Stats', (ctx) => {
    if (ctx.from.id.toString() === MI_ID) {
        ctx.reply(`📊 Stats: ${stats.visitas} visitas / ${stats.solicitudes} presupuestos.`);
    }
});

bot.launch().then(() => console.log('✅ Bot de Negocio Operativo'));
