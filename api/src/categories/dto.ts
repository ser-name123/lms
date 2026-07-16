import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const CATEGORY_TYPES = [
  'COURSE',
  'ASSIGNMENT',
  'ASSESSMENT',
  'KNOWLEDGEBASE',
] as const;

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIn(CATEGORY_TYPES)
  type!: (typeof CATEGORY_TYPES)[number];
}
