const { forwardTo } = require('prisma-binding');
const Query = {
    me(parent, args, ctx, info) {
        // check if there is a user with the userId
        if (!ctx.request.userId) return null;
        return ctx.db.query.user({
            where: {id: ctx.request.userId}
        }, info);
    },
    items: forwardTo('db'),
    item: forwardTo('db'),
    itemsConnection: forwardTo('db')
};

module.exports = Query;
