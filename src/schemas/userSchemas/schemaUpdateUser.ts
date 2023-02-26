import { z } from "zod"

const regexAtLeastOneNumber = /(?!^[0-9]*$)(?!^[a-zA-Z]*$)^([a-zA-Z0-9]{1,})$/

const schemaUpdateUser = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .email({
        message: "Formtado de e-mail inválido"
      })
      .optional(),
    username: z
      .string()
      .trim()
      .min(4, "Seu apelido é muito curto!")
      .max(20, "Seu apelido é muito longo!")
      .optional(),
    password: z
      .string()
      .trim()
      .min(8, "A Senha deve ter no mínimo 8 caracteres")
      .regex(regexAtLeastOneNumber, "A senha deve conter números e letras")
      .optional()
  }),
  params: z.object({
    user_id: z.string().uuid("ID de usuário inválido")
  })
})

const updateUserBodyShape = schemaUpdateUser.shape.body
const updateUserParamsShape = schemaUpdateUser.shape.params

declare global {
  type updateUserTypes = z.infer<typeof updateUserBodyShape>

  type updateUserParamsTypes = z.infer<typeof updateUserParamsShape>
}

export default schemaUpdateUser
