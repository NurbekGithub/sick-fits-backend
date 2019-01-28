const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");
const { hasPermission } = require("../utils");
const { transport, makeEmail } = require("../mail");
const stripe = require('../stripe');

function setCookie(token, res) {
  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 150
  });
}

const Mutations = {
  async createItem(parent, args, ctx, info) {
    // TODO: Check if they are logged in
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to do that");
    }
    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // This is how we create a relationship between entities;
          user: {
            connect: {
              id: ctx.request.userId
            }
          },
          ...args
        }
      },
      info
    );
    return item;
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    // 1: find the item
    const item = await ctx.db.query.item({ where }, `{ id, title }`);
    // 2: Check if they have permission to delete
    hasPermission(ctx.request.user, ["ITEMDELETE"]);
    // 3: Delete it

    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async updateItem(parent, args, ctx, info) {
    // first take a copy of the updates;
    const updates = { ...args };
    // remove the ID from updates
    delete updates.id;
    // run the update
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: { id: args.id }
      },
      info
    );
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    // hash their email
    const password = await bcrypt.hash(args.password, 10);
    // create the user in a db
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ["USER"] }
        }
      },
      info
    );
    // create JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // set JWT as a cookie on the response
    setCookie(token, ctx.response);
    return user;
  },
  async signin(parent, args, ctx, info) {
    const { email, password } = args;
    // Check if there is user with such email
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error("No such user found for email");
    }
    // Check if the password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("Invalid password");
    }
    // generate JWT token
    const token = await jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // Set the cookie with the token
    setCookie(token, ctx.response);
    // Returen the user
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Goodbye" };
  },
  async requestReset(parent, args, ctx, info) {
    // 1. Check if this is a real user
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error("No such user found for email");
    }
    // 2. Set a reset token and its expiry on that user
    const randomBytesPrm = promisify(randomBytes);
    const resetToken = (await randomBytesPrm(20)).toString("hex");
    const resetTokenExpiry = Date.now() + 1000 * 60 * 60; // 1h
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    });
    // 3. Email them that reset token
    transport.sendMail({
      from: "nurbekizbassar@gmail.com",
      to: user.email,
      subject: "Your reset password confirmation token",
      html: makeEmail(`
                To reset your password, please click a following link
                <a href="${
                  process.env.FRONTEND_URL
                }/reset?token=${resetToken}">Over here!✋</a>
            `)
    });
    // 4. Return a message;
    return { message: "Thanks!" };
  },
  async resetPassword(parent, args, ctx, info) {
    // 1. Check if the passwords match
    if (args.password !== args.passwordConfirm) {
      throw new Error(" Passwords do not match ");
    }
    // 2. Check if the reset token is legit
    // 3. Check if its not expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 1000 * 60 * 60
      }
    });
    if (!user) {
      throw new Error(" reset token is invalid or has expired ");
    }
    // 4. Hash their new password
    const password = await bcrypt.hash(args.password, 10);
    // 5. Save the new password and remove resetToken and resetTokenExpiry
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { id: user.id },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    });
    // 6. Generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    // 7. Set the JWT cookie
    setCookie(token, ctx.response);
    // 8. return new User
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    // 1. Check if they are logged in
    if (!ctx.request.user) {
      throw new Error("You must be logged in");
    }
    // 2. Check if they have permission to update permissions
    hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);
    // 3. Update
    const updatedUser = await ctx.db.mutation.updateUser(
      {
        data: { permissions: { set: args.permissions } },
        where: { id: args.id }
      },
      info
    );
    return updatedUser;
  },
  async addToCart(parent, args, ctx, info) {
    const { userId } = ctx.request;
    // 1. Check if they are logged in
    if (!userId) {
      throw new Error("You must be logged in");
    }
    // 2. Query the users current cart
    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id }
      }
    });
    // 3. Check if that item is already in their cart and increment by 1 if it is
    if (existingCartItem) {
      console.log("This item is already in the cart");
      return ctx.db.mutation.updateCartItem({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + 1
        }
      }, info);
    }
    // 4. If it is not, create a fresh cartItem for the user;
    return ctx.db.mutation.createCartItem({
      data: {
        quantity: 1,
        user: {
          connect: { id: userId }
        },
        item: {
          connect: { id: args.id }
        }
      }
    }, info);
  },
  async removeFromCart(parent, args, ctx, info) {
    // 1. fint the cart item
    const item = await ctx.db.query.cartItem({ where: {id: args.id} }, `{id, user { id }}`);
    if(!item) {
      throw new Error('No cart item found');
    }
    // 2. make sure they own the item
    if(item.user.id !== ctx.request.userId) {
      throw new Error(' You must own the item ');
    }
    // 3. delete the item from cart
    return ctx.db.mutation.deleteCartItem({ where: { id: item.id } }, info)
  },
  async createOrder(parent, args, ctx, info) {
    // 1. Query user and make sure they are signed in
    const { userId } = ctx.request;
    if (!userId) { throw new Error('You must be signed in to complete the order!') }
    const user = await ctx.db.query.user({ where: { id: userId } }, `
      {
        id,
        name
        email,
        cart {
          id
          quantity
          item {
            id
            title
            price
            description
            image
            largeImage
          }
        }
      }
    `);

    // 1.5 filter out cartItems which have item as null
    const filteredCartItems = user.cart.filter(cartItem => cartItem.item);
    // 2. recalculate total price
    const amount = filteredCartItems
      .reduce((tally, cartItem) => {
        if (!cartItem.item) return tally;
        return tally + cartItem.item.price * cartItem.quantity;
      }, 0);
    // 3. Create the stripe charge
    const charge = await stripe.charges.create({
      amount,
      currency: 'USD',
      source: args.token
    });
    // 4. Convert the CartItems to OrderItems
    const orderItems = filteredCartItems
      .map(cartItem => {
        const orderItem = {
          ...cartItem.item,
          quantity: cartItem.quantity,
          user: { connect: { id: userId } }
        }
        delete orderItem.id;
        return orderItem;
      })
    // 5. create the Order
    const order = await ctx.db.mutation.createOrder({
      data: {
        total: charge.amount,
        charge: charge.id,
        items: { create: orderItems },
        user: { connect: { id: userId } }
      }
    });
    // 6. Clean up - clear the user cart, delete cartItems,
    const cartItemIds = filteredCartItems.map(cartItem => cartItem.id);
    await ctx.db.mutation.deleteManyCartItems({ 
      where: { id_in: cartItemIds }
     });
    // 7. Return the Order to the client
    return order;
  }
};

module.exports = Mutations;
