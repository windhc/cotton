import {
  getColumns,
  getRelations,
  extractRelationalRecord,
  createModel,
  createModels,
  normalizeModel,
  getOriginal,
  mapRelationalResult,
  getTableName,
  isSaved,
  setSaved,
  getValues,
  compareWithOriginal,
  setPrimaryKey,
  getPrimaryKey,
  getPrimaryKeyInfo,
} from "../utils/models.ts";
import {
  Field,
  Relation,
  RelationType,
  FieldType,
  PrimaryField,
} from "../models/fields.ts";
import { Model } from "../models/model.ts";
import { assertEquals, assert, assertThrows } from "../../testdeps.ts";
import { formatDate } from "./date.ts";

const toUser = () => User;
const toProduct = () => Product;

class User extends Model {
  @PrimaryField()
  id!: number;

  @Field()
  email!: string;

  @Field({ name: "my_age" })
  age!: number;

  @Relation(RelationType.HasMany, toProduct, "user_id")
  products!: Product[];
}

class Product extends Model {
  @PrimaryField()
  id!: number;

  @Field()
  title!: string;

  @Relation(RelationType.BelongsTo, toUser, "user_id")
  user!: User;
}

Deno.test("getColumns", () => {
  assertEquals(getColumns(User), [{
    propertyKey: "id",
    select: true,
    name: "id",
    type: FieldType.Number,
    isPrimaryKey: true,
    isNullable: false,
  }, {
    propertyKey: "email",
    select: true,
    name: "email",
    type: FieldType.String,
    isPrimaryKey: false,
    isNullable: false,
  }, {
    propertyKey: "age",
    select: true,
    name: "my_age",
    type: FieldType.Number,
    isPrimaryKey: false,
    isNullable: false,
  }]);

  assertEquals(getColumns(Product), [{
    propertyKey: "id",
    select: true,
    name: "id",
    type: FieldType.Number,
    isPrimaryKey: true,
    isNullable: false,
  }, {
    propertyKey: "title",
    select: true,
    name: "title",
    type: FieldType.String,
    isPrimaryKey: false,
    isNullable: false,
  }]);
});

Deno.test("getRelations", () => {
  assertEquals(getRelations(User), [{
    propertyKey: "products",
    type: RelationType.HasMany,
    getModel: toProduct,
    targetColumn: "user_id",
  }]);

  assertEquals(getRelations(Product), [{
    propertyKey: "user",
    type: RelationType.BelongsTo,
    getModel: toUser,
    targetColumn: "user_id",
  }]);
});

Deno.test("extractRelationalRecord", () => {
  assertEquals(
    extractRelationalRecord({
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
      products__title: "Spoon",
      products__id: 2,
    }, User),
    {
      id: 1,
      email: "a@b.com",
      age: 16,
    },
  );

  assertEquals(
    extractRelationalRecord({
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
      products__title: "Spoon",
      products__id: 2,
    }, Product),
    {
      id: 2,
      title: "Spoon",
    },
  );
});

Deno.test("createModel: should create a model from database", () => {
  const user = createModel(User, { id: 1, email: "a@b.com", age: 16 }, true);
  assert(user instanceof User);
  assertEquals(user.id, 1);
  assertEquals(user.email, "a@b.com");
  assertEquals(user.age, 16);
  assertEquals(user.products, []);
  assert(isSaved(user));

  const product = createModel(Product, { id: 2, title: "Spoon" }, true);
  assert(product instanceof Product);
  assertEquals(product.id, 2);
  assertEquals(product.title, "Spoon");
  assertEquals(product.user, null);
  assert(isSaved(product));
});

Deno.test("createModel: should create a model not from database", () => {
  const user = createModel(User, { email: "a@b.com", age: 16 });
  assert(user instanceof User);
  assertEquals(user.email, "a@b.com");
  assertEquals(user.age, 16);
  assertEquals(user.products, []);
  assertEquals(isSaved(user), false);

  const product = createModel(Product, { title: "Spoon" });
  assert(product instanceof Product);
  assertEquals(product.title, "Spoon");
  assertEquals(product.user, null);
  assertEquals(isSaved(product), false);
});

Deno.test("createModel: should create a model with relationship", () => {
  const user = createModel(User, {
    id: 1,
    email: "a@b.com",
    age: 16,
    products: [{
      id: 1,
      title: "Spoon",
    }, {
      id: 2,
      title: "Table",
    }],
  }, true);
  assert(user instanceof User);
  assertEquals(user.id, 1);
  assertEquals(user.email, "a@b.com");
  assertEquals(user.age, 16);
  assert(Array.isArray(user.products));
  assertEquals(user.products.length, 2);
  assertEquals(
    user.products.map((item) => item instanceof Product),
    [true, true],
  );
  assert(isSaved(user));

  const product = createModel(Product, {
    id: 2,
    title: "Spoon",
    user: {
      id: 1,
      email: "a@b.com",
      age: 16,
    },
  }, true);
  assert(product instanceof Product);
  assertEquals(product.id, 2);
  assertEquals(product.title, "Spoon");
  assert(product.user instanceof User);
  assertEquals(product.user.id, 1);
  assertEquals(product.user.email, "a@b.com");
  assertEquals(product.user.age, 16);
  assert(isSaved(product));
});

Deno.test("createModels: should create models not from database", () => {
  const users = createModels(User, [
    { id: 1, email: "a@b.com", age: 16 },
    { id: 2, email: "b@c.com", age: 17 },
  ]);
  assert(Array.isArray(users));
  assertEquals(users.length, 2);
  assertEquals(users.map((item) => item instanceof User), [true, true]);
  assertEquals(users.map((item) => isSaved(item)), [false, false]);
});

Deno.test("createModels: should create models from database", () => {
  const users = createModels(User, [
    { id: 1, email: "a@b.com", age: 16 },
    { id: 2, email: "b@c.com", age: 17 },
  ], true);
  assert(Array.isArray(users));
  assertEquals(users.length, 2);
  assertEquals(users.map((item) => item instanceof User), [true, true]);
  assertEquals(users.map((item) => isSaved(item)), [true, true]);
});

Deno.test("normalizeModel", () => {
  class Post extends Model {
    @Field()
    title!: string;

    @Field()
    likes!: number;

    @Field()
    is_published!: boolean;

    @Field()
    published_at!: Date;
  }

  const date = new Date();

  const post = new Post();
  post.title = 25 as any;
  post.likes = "16" as any;
  post.is_published = 1 as any;
  post.published_at = formatDate(date) as any;

  normalizeModel(post);

  assertEquals(post.title, "25");
  assertEquals(post.likes, 16);
  assertEquals(post.is_published, true);
  assertEquals(post.published_at, date);
});

Deno.test("mapRelationalResult", () => {
  assertEquals(
    mapRelationalResult(User, ["products"], [{
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
      products__title: "Spoon",
      products__id: 1,
    }, {
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
      products__title: "Rice",
      products__id: 2,
    }, {
      users__id: 2,
      users__email: "b@c.com",
      users__age: 17,
      products__title: "Table",
      products__id: 3,
    }, {
      users__id: 3,
      users__email: "c@d.com",
      users__age: 18,
      products__title: null,
      products__id: null,
    }]),
    [{
      id: 1,
      email: "a@b.com",
      age: 16,
      products: [
        { title: "Spoon", id: 1 },
        { title: "Rice", id: 2 },
      ],
    }, {
      id: 2,
      email: "b@c.com",
      age: 17,
      products: [
        { title: "Table", id: 3 },
      ],
    }, {
      id: 3,
      email: "c@d.com",
      age: 18,
      products: [],
    }],
  );

  assertEquals(
    mapRelationalResult(Product, ["user"], [{
      products__title: "Spoon",
      products__id: 1,
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
    }, {
      products__title: "Rice",
      products__id: 2,
      users__id: 1,
      users__email: "a@b.com",
      users__age: 16,
    }, {
      products__title: "Table",
      products__id: 3,
      users__id: null,
      users__email: null,
      users__age: null,
    }]),
    [{
      id: 1,
      title: "Spoon",
      user: { email: "a@b.com", age: 16, id: 1 },
    }, {
      id: 2,
      title: "Rice",
      user: { email: "a@b.com", age: 16, id: 1 },
    }, {
      id: 3,
      title: "Table",
      user: null,
    }],
  );
});

Deno.test("getTableName: should get the default table name from the class name", () => {
  assertEquals(getTableName(User), "users");
  assertEquals(getTableName(Product), "products");
});

Deno.test("getTableName: should get a custom table name", () => {
  class Post extends Model {
    static tableName = "my_posts";
  }
  assertEquals(getTableName(Post), "my_posts");
});

Deno.test("isSaved, setSaved, getOriginal, and compareWithOriginal", () => {
  const user = new User();
  user.id = 1;
  user.email = "a@b.com";
  user.age = 16;
  assertEquals(isSaved(user), false);
  assertEquals(getOriginal(user), undefined);
  assertEquals(compareWithOriginal(user).isDirty, true);
  assertEquals(compareWithOriginal(user).changedFields, []);

  setSaved(user, true);
  assertEquals(isSaved(user), true);
  assertEquals(getOriginal(user), { id: 1, email: "a@b.com", my_age: 16 });
  assertEquals(compareWithOriginal(user).isDirty, false);
  assertEquals(compareWithOriginal(user).changedFields, []);

  user.email = "b@c.com";
  assertEquals(isSaved(user), true);
  assertEquals(getOriginal(user), { id: 1, email: "a@b.com", my_age: 16 });
  assertEquals(compareWithOriginal(user).isDirty, true);
  assertEquals(compareWithOriginal(user).changedFields, ["email"]);

  setSaved(user, false);
  assertEquals(isSaved(user), false);
  assertEquals(getOriginal(user), undefined);
  assertEquals(compareWithOriginal(user).isDirty, true);
  assertEquals(compareWithOriginal(user).changedFields, []);
});

Deno.test("getValues() -> default value", () => {
  class User extends Model {
    @Field({ default: "john" })
    name!: string;
  }

  const user = new User();
  assertEquals(getValues(user), { name: "john" });
});

Deno.test("getValues() -> nullable", () => {
  class User extends Model {
    @Field({ isNullable: true })
    name!: string;
  }

  const user = new User();
  assertEquals(getValues(user), { name: null });
});

Deno.test("getValues() -> nullable error", () => {
  class User extends Model {
    @Field()
    name!: string;
  }

  const user = new User();
  assertThrows(() => getValues(user), Error, "Field 'name' cannot be empty!");
});

Deno.test("getValues() -> property different than name", () => {
  class User extends Model {
    @Field({ name: "full_name" })
    name!: string;
  }

  const user = new User();
  user.name = "john";
  assertEquals(getValues(user), { full_name: "john" });
  assertEquals(getValues(user, ["name"]), { full_name: "john" });
});

Deno.test("setPrimaryKey, getPrimaryKey", () => {
  const user = new User();
});

Deno.test("setPrimaryKey and getPrimaryKey", () => {
  const user = new User();
  assertEquals(user.id, undefined);
  assertEquals(getPrimaryKey(user), undefined);

  setPrimaryKey(user, 1);
  assertEquals(user.id, 1);
  assertEquals(getPrimaryKey(user), 1);
});

Deno.test("getPrimaryKeyInfo", () => {
  assertEquals(getPrimaryKeyInfo(User), {
    propertyKey: "id",
    select: true,
    name: "id",
    type: FieldType.Number,
    isPrimaryKey: true,
    isNullable: false,
  });

  assertEquals(getPrimaryKeyInfo(Product), {
    propertyKey: "id",
    select: true,
    name: "id",
    type: FieldType.Number,
    isPrimaryKey: true,
    isNullable: false,
  });
});
