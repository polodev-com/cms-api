import yup from "yup";

export const getArticleListSchema = yup.object().shape({
    page: yup
        .number("page must be a number")
        .min(1, "Page can't be smaller than 1")
        .default(1)
        .required(),
    pageSize: yup
        .number("pageSize must be a number")
        .min(5, "pageSize can't be smaller than 5")
        .max(20, "pageSize can't be bigger than 20")
        .default(10)
        .required(),
    keywords: yup
        .string()
        .matches(
            /^([^,]*,){0,9}[^,]*$/,
            "Must be a comma-separated string with up to 10 items",
        )
        .notRequired(),
    sortby: yup
        .string()
        .oneOf(
            ["publish_on", "title"],
            "Invalid sortby, must be publish_on or title",
        ),
    sorttype: yup
        .string()
        .uppercase()
        .oneOf(["DESC", "ASC"], "Invalid sorttype, must be either DESC or ASC"),

    // NOTE: Admin only
    status: yup.string().when('$isAdmin', {
        is: true,
        then: (schema) => schema.oneOf(["hidden", "published", "delisted"]),
        otherwise: (schema) => schema.strip()
    }),
    // startDate: yup.date().default(moment().startOf("day").toDate()),
    // endDate: yup
    //   .date()
    //   .default(moment().subtract(1, "months").endOf("day").toDate()),
});

export const articleUpdateSchema = yup.object().shape({
    // TODO: Update validation when updating the article publish duration
    title: yup
        .string()
        .max(300, "Article title can't be longer than 300 characters")
        .notRequired(),
    description: yup.string(),
    keywords: yup.array().of(yup.string()),
});

export const getArticleStatSchema = yup.object().shape({
    keywords: yup.string().required("keywords param is required"),
});
