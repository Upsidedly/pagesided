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
              content: string;
              embeds?: MessageEmbed[];
          }
        | {
              embeds: MessageEmbed[];
              content?: string;
          }
    ) & {
        files?: MessageAttachment[];
    }
>;

export interface PaginationOptions {
    alreadyReplied?:
        | {
              value: true;
              message: Message;
          }
        | { value: false };
    timeout?: number;
    quickTravel?: boolean;
    filter?: CollectorFilter<[MessageComponentInteraction<CacheType>]>;
}

type Concrete<Type> = {
    [Property in keyof Type]-?: Type[Property];
};

function editButtons(index: number, max: number, buttons: MessageButton[]) {
    return buttons.map((button) => {
        if (['left, farleft'].includes(button.customId!) && index === 0) return button.setDisabled();
        if (['right', 'farright'].includes(button.customId!) && index === max) return button.setDisabled();
        return button;
    });
}

export async function createPaginator(interaction: Interaction, data: PaginationData, optionsRaw: PaginationOptions) {
    if (!interaction.isRepliable()) throw new Error('Interaction has to be repliable!');

    const defaults: PaginationOptions = {
        alreadyReplied: { value: false },
        timeout: 1000 * 60 * 15,
        quickTravel: true,
        filter: (inter) => inter.user.id === interaction.user.id,
    };
    const options = Object.assign({}, defaults, optionsRaw) as Concrete<PaginationOptions>;

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

    if (options.quickTravel) {
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

    let message: Message;

    if (options.alreadyReplied.value) {
        message = options.alreadyReplied.message;
        await interaction.editReply({
            content: data[index].content,
            embeds: data[index].embeds,
            files: data[index].files,
            components: [new MessageActionRow().addComponents(buttons)],
        });
    } else {
        const raw = await interaction.reply({
            content: data[index].content,
            embeds: data[index].embeds,
            files: data[index].files,
            components: [new MessageActionRow().addComponents(buttons)],
            fetchReply: true,
        });

        if (raw instanceof Message) {
            message = raw;
        } else throw new Error('Message not cached!');
    }

    const collector = message.createMessageComponentCollector({
        time: options.timeout,
        filter: (b) => options.filter(b) && b.isButton(),
    });

    collector.on('collect', async (button) => {
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

        await button.update({
            content: data[index].content,
            embeds: data[index].embeds,
            files: data[index].files,
            components: [new MessageActionRow().addComponents(editButtons(index, data.length - 1, buttons))],
        });
    });
}
