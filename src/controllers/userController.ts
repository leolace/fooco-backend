import { Request, Response } from "express"
import postRepository from "../repositories/postRepository"
import userRepository from "../repositories/userRepository"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { Equal, In, Not } from "typeorm"
import {
  BadRequestError,
  NotFoundError,
  TooManyRequests,
  UnauthorizedError
} from "../helpers/apiErrors"
import Post from "src/entities/Post"

class UserController {
  async index(req: Request, res: Response) {
    const { email } = req.query

    let users

    if (email) {
      users = await userRepository.findOne({
        where: { email: Equal(email as string) }
      })
    } else {
      users = await userRepository.find({
        relations: { posts: true, reply: true },
        relationLoadStrategy: "query",
        order: { posts: { points: "DESC" } }
      })
    }

    res.status(200).json(users)
  }

  async show(req: Request, res: Response) {
    const { username } = req.params
    const user = await userRepository.findOne({
      relations: {
        posts: { user: true, group: true },
        savedPosts: { user: true, group: true },
        reply: true
      },
      relationLoadStrategy: "query",
      where: { username }
    })

    if (!user) {
      throw new BadRequestError("Usuário não encontrado.")
    }

    res.json(user)
  }

  async store(req: Request<{}, {}, createUserTypes>, res: Response) {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      throw new BadRequestError("Todos os campos são obrigatórios.")
    }

    const usernameExists = await userRepository.findOne({
      where: { username }
    })

    const emailExists = await userRepository.findOne({
      where: { email }
    })

    if (usernameExists) {
      throw new BadRequestError("Este apelido já está em uso! Tente outro.")
    }

    if (emailExists) {
      throw new BadRequestError("Este e-mail já está em uso! Tente outro.")
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const newUser = userRepository.create({
      username,
      email,
      password: hashedPassword
    })
    await userRepository.save(newUser)

    const { password: _, ...user } = newUser

    res.status(201).json(user)
  }

  async update(
    req: Request<updateUserParamsTypes, {}, updateUserTypes>,
    res: Response
  ) {
    const { user_id } = req.params
    const { password, savedPostsId = [], ...newData } = req.body
    const { authorization } = req.headers

    let user = await userRepository.findOne({
      where: { id: user_id },
      relations: { savedPosts: true },
      select: { id: true, username: true, email: true, password: true }
    })

    if (!user) {
      throw new NotFoundError("Usuário não encontrado.")
    }

    const token = authorization!.split(" ")[1]

    const { id: token_id } = jwt.verify(token, process.env.JWT_PASS!) as {
      id: string
    }

    if (user.id !== token_id) {
      throw new UnauthorizedError("Usuário não autorizado.")
    }

    const usernameExists = await userRepository.findOne({
      where: { username: Equal(newData.username || ""), id: Not(user_id) }
    })

    const emailExists = await userRepository.findOne({
      where: { email: Equal(newData.email || ""), id: Not(user_id) }
    })

    if (usernameExists) {
      throw new BadRequestError("Este username já está em uso! Tente outro.")
    }

    if (emailExists) {
      throw new BadRequestError("Este e-mail já está em uso! Tente outro.")
    }

    const updatedPassword = password
      ? await bcrypt.hash(password, 10)
      : user.password

    const favoritePosts = await postRepository.findBy({ id: In(savedPostsId) })

    const savedPosts =
      favoritePosts.length > 0 ? favoritePosts : user.savedPosts

    const updatedUser = await userRepository.preload({
      ...user,
      ...newData,
      password: updatedPassword || user.password,
      savedPosts: savedPosts,
      id: user_id
    })

    if (!updatedUser) return

    await userRepository.save(updatedUser)

    const { password: _, ...userWithoutPassword } = updatedUser

    res.status(200).json(userWithoutPassword)
  }

  async delete(req: Request<deleteUserParamsTypes>, res: Response) {
    const { user_id } = req.params
    const { authorization } = req.headers

    const userExists = await userRepository.findOne({
      where: { id: user_id },
      relations: { posts: true }
    })

    if (!userExists) {
      throw new NotFoundError("Usuário não encontrado.")
    }

    const token = authorization!.split(" ")[1]

    const { id: token_id } = jwt.verify(token, process.env.JWT_PASS!) as {
      id: string
    }

    if (userExists.id !== token_id) {
      throw new UnauthorizedError("Usuário não autorizado.")
    }

    await postRepository.delete({ user: { id: user_id } })
    await userRepository.delete(user_id)

    res.status(200).json(userExists)
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body

    if (!email || !password) {
      throw new BadRequestError("Todos os campos são obrigatórios.")
    }

    const user = await userRepository.findOne({
      where: [{ email: email }, { username: email }],
      relations: { savedPosts: true },
      relationLoadStrategy: "query",
      select: [
        "password",
        "id",
        "username",
        "email",
        "about",
        "avatar_url",
        "banner_url",
        "educational_place",
        "educational_place_url",
        "posts",
        "created_at",
        "savedPosts"
      ]
    })

    if (!user) {
      throw new BadRequestError("E-mail ou senha inválidos.")
    }

    const verifiedPassword = await bcrypt.compare(password, user.password)

    if (!verifiedPassword) {
      throw new BadRequestError("E-mail ou senha inválidos.")
    }

    const token = jwt.sign(
      { username: user.username, id: user.id },
      process.env.JWT_PASS!,
      {
        expiresIn: "60d"
      }
    )

    const { password: _, ...userLogin } = user

    res.status(200).json({ token, user: userLogin })
  }
}

export default new UserController()
