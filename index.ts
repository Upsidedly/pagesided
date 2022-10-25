import {
    CacheType,
    CollectorFilter,
    Interaction,
    Message,
    MessageActionRow,
    MessageAttachment,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
} from 'discord.js';

export type PaginationData = Array<
    (
        | {
              /**
               * Message content
               */
              content: string;
              /**
               * Embeds of the message
               */
              embeds?: MessageEmbed[];
          }
        | {
              /**
               * Embeds of the message
               */
              embeds: MessageEmbed[];
              /**
               * Message content
               */
              content?: string;
          }
    ) & {
        /**
         * Message attachments
         */
        files?: MessageAttachment[];
    }
>;

export interface PaginationOptions {
    /**
     * If the interaction provided has already been replied to.
     * @property `value` If it was replied to or not
     * @property `message` The message object (if replied to)
     */
    alreadyReplied?:
        | {
              value: true;
              message: Message;
          }
        | { value: false };
    /**
     * Time in milliseconds until the button collector times out
     * @default 1000 * 60 * 15 // 15 minutes
     */
    timeout?: number;
    /**
     * If the buttons should also include quick travel buttons: to start, to end
     * @default true
     */
    quickTravel?: boolean;
    /**
     * Custom filter for the buttons
     * @default (button) => button.user.id === interaction.user.id
     */
    filter?: CollectorFilter<[MessageComponentInteraction<CacheType>]>;
    /**
     * The message to send when someone who doesn't pass the filter clickes on a button
     * @default "This isn't yours"
     */
    notYoursMessage?: string;
    /**
     * If the interaction has already replied to, if the pagination message should be a follow up instead of an edit.
     */
    followUp?: boolean;
    /**
     * If there should be a "not yours" message (button filter failed message)
     */
    notYours?: boolean;
}

type Concrete<Type> = { [Property in keyof Type]-?: Type[Property] };

function editButtons(index: number, max: number, buttons: MessageButton[]) {
    return buttons.map((button) => {
        if (['left, farleft'].includes(button.customId!) && index === 0) return button.setDisabled();
        if (['right', 'farright'].includes(button.customId!) && index === max) return button.setDisabled();
        if (button.customId! === 'pages') return button.setLabel(`${index + 1}/${max + 1}`);
        return button.setDisabled(false);
    });
}

/**
 * Creates a paginated message
 * @param interaction The interaction to make the pagination off of
 * @param data The pagination data
 * @param options Extra pagination options
 */
export async function createPaginator(interaction: Interaction, data: PaginationData, options?: PaginationOptions) {
    if (!interaction.isRepliable()) throw new Error('Interaction has to be repliable!');

    const defaults: PaginationOptions = {
        alreadyReplied: { value: false },
        timeout: 1000 * 60 * 15,
        quickTravel: true,
        filter: (inter) => inter.user.id === interaction.user.id,
        notYoursMessage: "This isn't yours.",
        followUp: false,
        notYours: true,
    };
    const config = Object.assign({}, defaults, options ?? {}) as Concrete<PaginationOptions>;

    let index = 0;

    const buttons = [
        new MessageButton().setCustomId('left').setLabel('<').setStyle('PRIMARY').setDisabled(),
        new MessageButton().setCustomId('pages').setLabel(`1/${data.length}`).setStyle('SECONDARY').setDisabled(),
        new MessageButton()
            .setCustomId('right')
            .setLabel('>')
            .setStyle('PRIMARY')
            .setDisabled(index === data.length - 1),
    ];

    if (config.quickTravel) {
        // Far-left
        buttons.unshift(
            new MessageButton()
                .setCustomId('farleft')
                .setLabel('<<')
                .setDisabled()
                .setStyle('SUCCESS')
                .setDisabled(index === data.length - 1),
        );

        // Far-right
        buttons.push(
            new MessageButton()
                .setCustomId('farright')
                .setLabel('>>')
                .setStyle('SUCCESS')
                .setDisabled(index === data.length - 1),
        );
    }

    function getReplyData() {
        return {
            content: data[index].content,
            embeds: data[index].embeds,
            files: data[index].files,
            components: [new MessageActionRow().addComponents(buttons)],
        };
    }

    let message: Message;

    if (config.alreadyReplied.value) {
        if (config.followUp === false) {
            message = config.alreadyReplied.message;
            await interaction.editReply(getReplyData());
        } else {
            const raw = await interaction.followUp({ ...getReplyData(), fetchReply: true });
            if (!(raw instanceof Message)) throw new Error('Message is not cached!');
            message = raw;
        }
    } else {
        const raw = interaction.reply({ ...getReplyData(), fetchReply: true });

        if (raw instanceof Message) {
            message = raw;
        } else throw new Error('Message not cached!');
    }

    const collector = message.createMessageComponentCollector({
        time: config.timeout,
        filter: (b) => {
            const valid = config.filter(b) && b.isButton();
            if (!valid && config.notYours) b.reply({ content: config.notYoursMessage, ephemeral: true });
            return valid;
        },
    });

    collector
        .on('collect', async (button) => {
            switch (button.customId) {
                case 'left':
                    index--;
                    break;

                case 'right':
                    index++;
                    break;

                case 'farleft':
                    index = 0;
                    break;

                case 'farright':
                    index = data.length - 1;
                    break;
            }

            await button.update(getReplyData());
        })
        .on('end', () => {
            message.edit({
                components: [new MessageActionRow().addComponents(editButtons(index, data.length - 1, buttons).map((b) => b.setDisabled()))],
            });
        });
}
